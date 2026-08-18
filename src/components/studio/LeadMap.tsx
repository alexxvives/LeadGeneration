"use client";

/**
 * LeadMap — Leaflet map of board leads.
 *
 * Nominatim is rate-limited; /api/geocode persists hits in D1 so cold isolates
 * don't re-query. Strategy:
 *   1. Geocode board location hint → place pins with light city jitter (fast).
 *   2. Refine unique city/region keys (capped).
 *   3. Background street-level refine for every unique full address (batched;
 *      pins update as each batch lands so markers move to exact spots).
 *   Hydrate paging adds pins in place and keeps the current zoom. Viewport
 *   only resets when the board (or location hint) changes.
 *
 * Important: Leaflet mutates the DOM node passed to L.map(). We keep a nested
 * `mapEl` that React never reconciles children into, and we clear `_leaflet_id`
 * on Strict Mode remount so init isn't a silent no-op (blank map).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CrmStage, LeadWithOutreach } from "@/lib/types";
import {
  cityKey,
  geocode,
  isStreetCandidate,
  peekGeocodeCache,
  type Coords,
} from "@/lib/geocode-client";
import { useDeferredLoading } from "./skeletons";

type Pin = { id: string; company: string; coords: Coords; crmStage: CrmStage };

/** Hex colors aligned with Pipeline column dots (mist-500 / amber / sky / aurora / rose). */
const STAGE_PIN: Record<CrmStage, { fill: string; glow: string; label: string }> = {
  new: { fill: "#7f92b3", glow: "rgba(127,146,179,0.4)", label: "New" },
  contacted: { fill: "#f7b955", glow: "rgba(247,185,85,0.4)", label: "Contacted" },
  in_conversation: { fill: "#38bdf8", glow: "rgba(56,189,248,0.4)", label: "In Conversation" },
  closed: { fill: "#7ff2c8", glow: "rgba(127,242,200,0.45)", label: "Closed" },
  not_interested: { fill: "#fb7185", glow: "rgba(251,113,133,0.4)", label: "Not Interested" },
};

const LEGEND_ORDER: CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
];

/** Cap city-level refine lookups — enough for regional boards, not street-level spam. */
const MAX_CITY_GEOCODES = 60;
/** Street geocodes per background batch (D1/local cache makes repeats free). */
const STREET_BATCH = 12;
const STREET_BATCH_PAUSE_MS = 350;
const GEOCODE_CONCURRENCY = 3;

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

function jitter(seed: string, radius = 0.035): { dLat: number; dLng: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = (h % 360) * (Math.PI / 180);
  const r = ((h % 1000) / 1000) * radius;
  return { dLat: Math.sin(a) * r, dLng: Math.cos(a) * r };
}

function ensureLeafletCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("leaflet-css")) return;
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

/**
 * Only pin leads with a geocode of their own location (exact street, or city
 * when not a street candidate / after street failed). Never place a pin from
 * the board hint alone — those look "mapped" but aren't.
 */
function buildPinsAround(
  leads: LeadWithOutreach[],
  centers: Map<string, Coords>,
  exactByLoc: Map<string, Coords> | undefined,
  opts: { refining: boolean; streetPending: Set<string> },
): { pins: Pin[]; remaining: number } {
  const next: Pin[] = [];
  let remaining = 0;
  for (const l of leads) {
    const loc = l.location?.trim() ?? "";
    if (!loc) {
      remaining++;
      continue;
    }
    const locKey = loc.toLowerCase();
    const exact = exactByLoc?.get(locKey) ?? null;
    if (exact) {
      // Tiny offset so stacked same-building pins stay clickable.
      const j = jitter(l.id || l.company, 0.0005);
      next.push({
        id: l.id,
        company: l.company,
        coords: { lat: exact.lat + j.dLat, lng: exact.lng + j.dLng },
        crmStage: l.crmStage ?? "new",
      });
      continue;
    }

    // Still waiting on street refine — don't show a fuzzy city pin yet.
    if (isStreetCandidate(loc) && (opts.refining || opts.streetPending.has(locKey))) {
      remaining++;
      continue;
    }

    const key = cityKey(loc);
    const coords = key ? centers.get(key) ?? null : null;
    if (!coords) {
      remaining++;
      continue;
    }

    const j = jitter(l.id || l.company, 0.012);
    next.push({
      id: l.id,
      company: l.company,
      coords: { lat: coords.lat + j.dLat, lng: coords.lng + j.dLng },
      crmStage: l.crmStage ?? "new",
    });
  }
  return { pins: next, remaining };
}

export function LeadMap({
  leads,
  locationHint,
  boardId,
  onOpen,
}: {
  leads: LeadWithOutreach[];
  locationHint: string | null;
  /** Board switch (not hydrate paging) resets pins + viewport. */
  boardId?: string | null;
  onOpen: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const didFitRef = useRef(false);
  const geoGenRef = useRef(0);
  const resetKeyRef = useRef("");
  const centersRef = useRef(new Map<string, Coords>());
  const exactRef = useRef(new Map<string, Coords>());
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [loadingPins, setLoadingPins] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const mapBusy = (!ready || loadingPins) && !initError;
  const showMapSkeleton = useDeferredLoading(mapBusy);

  const mapLeads = leads;

  const applyPins = (
    centers: Map<string, Coords>,
    exact: Map<string, Coords> | undefined,
    opts: { refining: boolean; streetPending: Set<string> },
  ) => {
    const built = buildPinsAround(mapLeads, centers, exact, opts);
    setPins(built.pins);
    setRemaining(built.remaining);
    return built;
  };

  const hint = useMemo(
    () =>
      locationHint?.trim() ||
      mapLeads.find((l) => l.location)?.location ||
      "",
    [locationHint, mapLeads],
  );

  // Compact content hash — O(n) CPU, O(1) string (avoid joining 2k addresses).
  const leadKey = useMemo(() => {
    let h = mapLeads.length >>> 0;
    for (const l of mapLeads) {
      const s = `${l.id}\0${l.location ?? ""}\0${l.crmStage ?? "new"}`;
      for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
    }
    return String(h);
  }, [mapLeads]);

  // Board identity — hydrate paging and hint fallback must not reset zoom.
  const resetKey = boardId ?? "";

  useEffect(() => {
    let cancelled = false;
    const boardChanged = resetKeyRef.current !== resetKey;
    if (boardChanged) {
      resetKeyRef.current = resetKey;
      geoGenRef.current += 1;
      centersRef.current = new Map();
      exactRef.current = new Map();
      didFitRef.current = false;
      setPins([]);
      setRemaining(0);
      setLoadingPins(true);
    }
    const gen = geoGenRef.current;
    const centers = centersRef.current;
    const exact = exactRef.current;
    const stillThisRun = () => !cancelled && gen === geoGenRef.current;

    (async () => {
      const hintLower = hint.trim().toLowerCase();
      const base = hint ? await geocode(hint) : null;
      if (!stillThisRun()) return;

      if (base && hintLower) centers.set(cityKey(hint), base);

      const cities = new Set<string>();
      const streets: string[] = [];
      const seenStreet = new Set<string>();
      for (const l of mapLeads) {
        const loc = l.location?.trim();
        if (!loc) continue;
        const key = cityKey(loc);
        if (key && !centers.has(key)) cities.add(key);
        if (!isStreetCandidate(loc)) continue;
        const locKey = loc.toLowerCase();
        if (seenStreet.has(locKey)) continue;
        seenStreet.add(locKey);
        streets.push(locKey);
      }

      for (const loc of streets) {
        if (exact.has(loc)) continue;
        const cached = peekGeocodeCache(loc);
        if (cached) exact.set(loc, cached);
      }

      const streetPending = new Set(
        streets.filter((loc) => !exact.has(loc)),
      );
      const immediate = applyPins(centers, exact, {
        refining: streetPending.size > 0,
        streetPending,
      });
      setError(
        immediate.pins.length === 0 && immediate.remaining === mapLeads.length
          ? "Couldn't place leads on the map. Add addresses on leads, or wait for scraped locations."
          : null,
      );
      setLoadingPins(false);

      const toResolve = [...cities].slice(0, MAX_CITY_GEOCODES);
      if (toResolve.length > 0) {
        await mapPool(toResolve, GEOCODE_CONCURRENCY, async (key) => {
          if (!stillThisRun()) return;
          const coords = await geocode(key);
          if (coords && stillThisRun()) centers.set(key, coords);
        });
        if (!stillThisRun()) return;
        applyPins(centers, exact, {
          refining: streetPending.size > 0,
          streetPending,
        });
      }

      const pending = streets.filter((loc) => !exact.has(loc));
      for (let i = 0; i < pending.length; i += STREET_BATCH) {
        if (!stillThisRun()) return;
        const batch = pending.slice(i, i + STREET_BATCH);
        await mapPool(batch, GEOCODE_CONCURRENCY, async (loc) => {
          if (!stillThisRun()) return;
          const coords = await geocode(loc);
          if (!stillThisRun()) return;
          if (coords) exact.set(loc, coords);
          streetPending.delete(loc);
        });
        if (!stillThisRun()) return;
        applyPins(centers, exact, { refining: true, streetPending });
        if (i + STREET_BATCH < pending.length) {
          await new Promise((r) => setTimeout(r, STREET_BATCH_PAUSE_MS));
        }
      }

      if (!stillThisRun()) return;
      applyPins(centers, exact, {
        refining: false,
        streetPending: new Set(),
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadKey, hint, resetKey]);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        ensureLeafletCss();
        const el = mapElRef.current;
        if (!el) return;

        const L = await import("leaflet");
        if (cancelled || !mapElRef.current) return;

        const dirty = el as HTMLDivElement & { _leaflet_id?: number };
        if (dirty._leaflet_id) {
          try {
            mapRef.current?.remove();
          } catch {
            /* ignore */
          }
          dirty._leaflet_id = undefined;
          el.replaceChildren();
        }

        // Canvas renderer: 2k circle markers stay usable; DivIcon DOM pins do not.
        const map = L.map(el, {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
        }).setView([20, 0], 2);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        markersRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setReady(true);
        setInitError(null);

        const invalidate = () => {
          try {
            map.invalidateSize({ animate: false });
          } catch {
            /* ignore */
          }
        };
        requestAnimationFrame(invalidate);
        setTimeout(invalidate, 100);
        setTimeout(invalidate, 400);

        if (wrapRef.current) {
          ro = new ResizeObserver(invalidate);
          ro.observe(wrapRef.current);
        }
      } catch (e) {
        if (!cancelled) {
          setInitError(e instanceof Error ? e.message : "Map failed to load");
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      try {
        mapRef.current?.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      markersRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !markersRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !markersRef.current || !mapRef.current) return;
      markersRef.current.clearLayers();

      const latLngs: import("leaflet").LatLngExpression[] = [];
      for (const pin of pins) {
        const c = STAGE_PIN[pin.crmStage] ?? STAGE_PIN.new;
        const marker = L.circleMarker([pin.coords.lat, pin.coords.lng], {
          radius: 6,
          color: "#060a12",
          weight: 1.5,
          fillColor: c.fill,
          fillOpacity: 0.95,
        });
        const stageLabel = c.label;
        marker.bindTooltip(`${pin.company} · ${stageLabel}`, {
          direction: "top",
          offset: [0, -8],
        });
        marker.on("click", () => onOpenRef.current(pin.id));
        markersRef.current.addLayer(marker);
        latLngs.push([pin.coords.lat, pin.coords.lng]);
      }

      // Fit once on first pin set. Hydrate paging and street refine only
      // add/move markers — they must not reset zoom or pan.
      if (!didFitRef.current && latLngs.length > 0) {
        didFitRef.current = true;
        if (latLngs.length === 1) {
          mapRef.current.setView(latLngs[0]!, 12, { animate: false });
        } else {
          mapRef.current.fitBounds(L.latLngBounds(latLngs), {
            padding: [48, 48],
            maxZoom: 13,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pins, ready]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl2 border border-white/10 bg-ink-900"
        data-testid="lead-map"
      >
        <div
          ref={mapElRef}
          className="h-full w-full min-h-[240px] [&_.leaflet-tile-pane]:brightness-[0.72] [&_.leaflet-tile-pane]:contrast-[1.05] [&_.leaflet-tile-pane]:saturate-[0.85]"
        />
        {mapBusy && showMapSkeleton ? (
          <div
            className="absolute inset-0 z-[500] overflow-hidden bg-ink-900"
            role="status"
            aria-busy="true"
            aria-label="Loading map"
          >
            <div className="absolute inset-0 shimmer" />
            <div className="absolute right-4 top-4 h-7 w-28 rounded-full border border-white/5 bg-ink-950/40 shimmer" />
            <div className="absolute bottom-3 left-1/2 h-6 w-56 -translate-x-1/2 rounded-full border border-white/5 bg-ink-950/40 shimmer sm:w-72" />
          </div>
        ) : null}
        {(error || initError) && (
          <div className="absolute bottom-4 left-4 right-4 z-[500] rounded-lg border border-amber-400/40 bg-ink-900/95 px-4 py-3 text-sm text-mist-100 shadow-lg backdrop-blur">
            {initError ?? error}
          </div>
        )}
        {ready && !error && !initError && (pins.length > 0 || remaining > 0) && (
          <div
            className="pointer-events-none absolute right-4 top-4 z-[500] max-w-[min(100%-2rem,20rem)] rounded-full border border-white/10 bg-ink-900/90 px-3 py-1.5 text-xs text-mist-300 shadow backdrop-blur"
            data-testid="map-pin-count"
          >
            {pins.length > 0
              ? `${pins.length} pin${pins.length === 1 ? "" : "s"}`
              : "Mapping…"}
            {remaining > 0
              ? ` · ${remaining} lead${remaining === 1 ? "" : "s"} remaining to be mapped…`
              : ""}
          </div>
        )}
        {pins.length > 0 && (
          <ul className="pointer-events-none absolute bottom-3 left-1/2 z-[500] flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full border border-white/10 bg-ink-900/90 px-3 py-1.5 text-[11px] text-mist-400 shadow backdrop-blur">
            {LEGEND_ORDER.map((stage) => {
              const c = STAGE_PIN[stage];
              return (
                <li key={stage} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-2 ring-ink-950"
                    style={{ backgroundColor: c.fill, boxShadow: `0 0 0 3px ${c.glow}` }}
                  />
                  {c.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

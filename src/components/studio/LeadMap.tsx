"use client";

/**
 * LeadMap — Leaflet map of board leads.
 *
 * Nominatim (/api/geocode) is slow and rate-limited. With 2k+ street addresses,
 * geocoding every unique string stalls the map for minutes. Strategy:
 *   1. Geocode the board location hint once → place every pin with jitter (fast).
 *   2. Optionally refine by city/region key (last 2 comma parts), concurrency-
 *      limited, so pins settle near their city without thousands of API calls.
 *
 * Important: Leaflet mutates the DOM node passed to L.map(). We keep a nested
 * `mapEl` that React never reconciles children into, and we clear `_leaflet_id`
 * on Strict Mode remount so init isn't a silent no-op (blank map).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CrmStage, LeadWithOutreach } from "@/lib/types";
import { api } from "@/lib/client-api";
import { useDeferredLoading } from "./skeletons";

type Coords = { lat: number; lng: number };
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
const GEOCODE_CONCURRENCY = 3;

const geocodeCache = new Map<string, Coords | null>();
const geocodeInflight = new Map<string, Promise<Coords | null>>();

/** Try full address, then city/country tails — Nominatim often misses long streets. */
function geocodeCandidates(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const parts = q.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [q];
  if (parts.length >= 2) out.push(parts.slice(-2).join(", "));
  if (parts.length >= 3) out.push(parts.slice(-3).join(", "));
  // "08037 Barcelona" style token → "Barcelona, Spain" when country present
  if (parts.length >= 2) {
    const cityish = parts[parts.length - 2]!.replace(/^\d+\s+/, "").trim();
    const country = parts[parts.length - 1]!;
    if (cityish.length >= 2) out.push(`${cityish}, ${country}`);
  }
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

/** City/region key for grouping pins (avoids geocoding every street). */
function cityKey(loc: string): string {
  const parts = loc
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ").toLowerCase();
  return loc.trim().toLowerCase();
}

async function geocodeExact(query: string): Promise<Coords | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  const pending = geocodeInflight.get(key);
  if (pending) return pending;

  const req = (async () => {
    try {
      const { coords } = await api.geocode(key);
      geocodeCache.set(key, coords);
      return coords;
    } catch {
      geocodeCache.set(key, null);
      return null;
    } finally {
      geocodeInflight.delete(key);
    }
  })();
  geocodeInflight.set(key, req);
  return req;
}

async function geocode(query: string): Promise<Coords | null> {
  for (const candidate of geocodeCandidates(query)) {
    const coords = await geocodeExact(candidate);
    if (coords) return coords;
  }
  return null;
}

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

function buildPinsAround(
  leads: LeadWithOutreach[],
  centers: Map<string, Coords>,
  fallback: Coords | null,
  hintLower: string,
): Pin[] {
  const next: Pin[] = [];
  for (const l of leads) {
    const loc = (l.location?.trim() || hintLower).trim();
    const key = loc ? cityKey(loc) : "";
    let coords = key ? centers.get(key) ?? null : null;
    if (!coords) coords = fallback;
    if (!coords) continue;

    const sameAsHint = !loc || loc.toLowerCase() === hintLower;
    const j = jitter(l.id || l.company, sameAsHint ? 0.02 : 0.028);
    next.push({
      id: l.id,
      company: l.company,
      coords: { lat: coords.lat + j.dLat, lng: coords.lng + j.dLng },
      crmStage: l.crmStage ?? "new",
    });
  }
  return next;
}

export function LeadMap({
  leads,
  locationHint,
  onOpen,
}: {
  leads: LeadWithOutreach[];
  locationHint: string | null;
  onOpen: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [loadingPins, setLoadingPins] = useState(true);
  const [refining, setRefining] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const mapBusy = (!ready || loadingPins) && !initError;
  const showMapSkeleton = useDeferredLoading(mapBusy);

  const mapLeads = leads;

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPins(true);
      setRefining(false);
      const hintLower = hint.trim().toLowerCase();
      const base = hint ? await geocode(hint) : null;
      if (cancelled) return;

      // Fast path: one geocode → all pins visible immediately.
      const centers = new Map<string, Coords>();
      if (base && hintLower) centers.set(cityKey(hint), base);

      const immediate = buildPinsAround(mapLeads, centers, base, hintLower);
      setPins(immediate);
      setError(
        immediate.length === 0
          ? "Couldn't place leads on the map. Add a Location to your search, or wait for scraped addresses."
          : null,
      );
      setLoadingPins(false);

      // Refine: unique city/region keys only (not every street), capped + pooled.
      const cities = new Set<string>();
      for (const l of mapLeads) {
        const loc = l.location?.trim();
        if (!loc) continue;
        const key = cityKey(loc);
        if (key && key !== cityKey(hint) && !centers.has(key)) cities.add(key);
      }
      const toResolve = [...cities].slice(0, MAX_CITY_GEOCODES);
      if (toResolve.length === 0 || !base) return;

      setRefining(true);
      await mapPool(toResolve, GEOCODE_CONCURRENCY, async (key) => {
        if (cancelled) return;
        const coords = await geocode(key);
        if (coords) centers.set(key, coords);
      });
      if (cancelled) return;

      const refined = buildPinsAround(mapLeads, centers, base, hintLower);
      setPins(refined);
      setRefining(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadKey, hint]);

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

      if (latLngs.length === 1) {
        mapRef.current.setView(latLngs[0]!, 12, { animate: false });
      } else if (latLngs.length > 1) {
        mapRef.current.fitBounds(L.latLngBounds(latLngs), {
          padding: [48, 48],
          maxZoom: 13,
        });
      }
      setTimeout(() => mapRef.current?.invalidateSize(), 80);
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
        {ready && !error && !initError && pins.length > 0 && (
          <div
            className="pointer-events-none absolute right-4 top-4 z-[500] rounded-full border border-white/10 bg-ink-900/90 px-3 py-1.5 text-xs text-mist-300 shadow backdrop-blur"
            data-testid="map-pin-count"
          >
            {pins.length} pin{pins.length === 1 ? "" : "s"}
            {hint ? ` · ${hint}` : ""}
            {refining ? " · refining…" : ""}
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

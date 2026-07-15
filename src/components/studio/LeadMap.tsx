"use client";

/**
 * LeadMap — Leaflet map of board leads.
 *
 * Nominatim (/api/geocode) takes place-name strings ("barcelona"), not lat/lng.
 * Pins jitter around the search Location when leads share a city string.
 *
 * Important: Leaflet mutates the DOM node passed to L.map(). We keep a nested
 * `mapEl` that React never reconciles children into, and we clear `_leaflet_id`
 * on Strict Mode remount so init isn't a silent no-op (blank map).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CrmStage, LeadWithOutreach } from "@/lib/types";
import { api } from "@/lib/client-api";
import { Spinner } from "@/components/ui";

type Coords = { lat: number; lng: number };
type Pin = { id: string; company: string; coords: Coords; crmStage: CrmStage };

/** Hex colors aligned with Pipeline column dots. */
const STAGE_PIN: Record<CrmStage, { fill: string; glow: string; label: string }> = {
  new: { fill: "#0a0a0a", glow: "rgba(10,10,10,0.45)", label: "New" },
  contacted: { fill: "#f7b955", glow: "rgba(247,185,85,0.4)", label: "Contacted" },
  in_conversation: { fill: "#38bdf8", glow: "rgba(56,189,248,0.4)", label: "In Conversation" },
  closed: { fill: "#7ff2c8", glow: "rgba(127,242,200,0.45)", label: "Closed" },
  not_interested: { fill: "#fb7185", glow: "rgba(251,113,133,0.4)", label: "Not Interested" },
  discarded: { fill: "#5c6b82", glow: "rgba(92,107,130,0.35)", label: "Discarded" },
};

const LEGEND_ORDER: CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
  "discarded",
];

const geocodeCache = new Map<string, Coords | null>();
const geocodeInflight = new Map<string, Promise<Coords | null>>();

async function geocode(query: string): Promise<Coords | null> {
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

function pinIconHtml(stage: CrmStage): string {
  const c = STAGE_PIN[stage] ?? STAGE_PIN.new;
  return `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${c.fill};box-shadow:0 0 0 4px ${c.glow};border:2px solid #060a12"></span>`;
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
  const [initError, setInitError] = useState<string | null>(null);

  const hint = useMemo(
    () => locationHint?.trim() || leads.find((l) => l.location)?.location || "",
    [locationHint, leads],
  );

  const leadKey = useMemo(
    () => leads.map((l) => `${l.id}:${l.location ?? ""}:${l.crmStage ?? "new"}`).join("|"),
    [leads],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPins(true);
      const base = hint ? await geocode(hint) : null;
      if (cancelled) return;

      const uniqueLocs = new Set<string>();
      for (const l of leads) {
        const loc = (l.location?.trim() || hint).trim();
        if (loc) uniqueLocs.add(loc);
      }
      const resolved = new Map<string, Coords | null>();
      await Promise.all(
        [...uniqueLocs].map(async (loc) => {
          resolved.set(loc, await geocode(loc));
        }),
      );
      if (cancelled) return;

      const next: Pin[] = [];
      for (const l of leads) {
        const loc = (l.location?.trim() || hint).trim();
        let coords = loc ? resolved.get(loc) ?? null : null;
        if (!coords && base) {
          const j = jitter(l.id || l.company);
          coords = { lat: base.lat + j.dLat, lng: base.lng + j.dLng };
        } else if (coords && loc.toLowerCase() === hint.toLowerCase() && base) {
          const j = jitter(l.id || l.company, 0.02);
          coords = { lat: coords.lat + j.dLat, lng: coords.lng + j.dLng };
        }
        if (coords) {
          next.push({
            id: l.id,
            company: l.company,
            coords,
            crmStage: l.crmStage ?? "new",
          });
        }
      }

      if (cancelled) return;
      setPins(next);
      setError(
        next.length === 0
          ? "Couldn't place leads on the map. Add a Location to your search, or wait for scraped addresses."
          : null,
      );
      setLoadingPins(false);
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

        const map = L.map(el, {
          zoomControl: true,
          attributionControl: true,
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
        const icon = L.divIcon({
          className: "leadify-map-pin",
          html: pinIconHtml(pin.crmStage),
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker([pin.coords.lat, pin.coords.lng], { icon });
        const stageLabel = STAGE_PIN[pin.crmStage]?.label ?? pin.crmStage;
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
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl2 border border-white/10 bg-ink-900"
        data-testid="lead-map"
      >
        <div
          ref={mapElRef}
          className="h-[min(70vh,560px)] w-full [&_.leaflet-tile-pane]:brightness-[0.72] [&_.leaflet-tile-pane]:contrast-[1.05] [&_.leaflet-tile-pane]:saturate-[0.85]"
          style={{ minHeight: 360 }}
        />
        {(!ready || loadingPins) && !initError && (
          <div className="absolute inset-0 z-[500] grid place-items-center bg-ink-900/70">
            <Spinner className="h-7 w-7 text-aurora-400" />
          </div>
        )}
        {(error || initError) && (
          <div className="absolute bottom-4 left-4 right-4 z-[500] rounded-lg border border-amber-400/20 bg-ink-950/90 px-4 py-3 text-sm text-amber-200/90 backdrop-blur">
            {initError ?? error}
          </div>
        )}
        {ready && !error && !initError && pins.length > 0 && (
          <div
            className="pointer-events-none absolute left-4 top-4 z-[500] rounded-full border border-white/10 bg-ink-950/80 px-3 py-1.5 text-xs text-mist-300 backdrop-blur"
            data-testid="map-pin-count"
          >
            {pins.length} pin{pins.length === 1 ? "" : "s"}
            {hint ? ` · ${hint}` : ""}
          </div>
        )}
      </div>

      {pins.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11px] text-mist-500">
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
  );
}

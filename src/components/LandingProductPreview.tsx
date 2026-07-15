"use client";

/**
 * Decorative product preview for the marketing landing — real OSM tiles +
 * pipeline strip. Not wired to live data; Leaflet only so the hero stays light.
 */

import { useEffect, useRef, useState } from "react";

const AUSTIN = { lat: 30.2672, lng: -97.7431 };

const PINS = [
  { lat: 30.284, lng: -97.742, stage: "new" as const, label: "Summit Dental" },
  { lat: 30.251, lng: -97.769, stage: "contacted" as const, label: "Oak Street DDS" },
  { lat: 30.298, lng: -97.721, stage: "in_conversation" as const, label: "River City Smile" },
  { lat: 30.239, lng: -97.728, stage: "closed" as const, label: "Lamar Ortho" },
  { lat: 30.272, lng: -97.785, stage: "new" as const, label: "Westlake Family" },
];

const STAGE_COLOR = {
  new: "#7f92b3",
  contacted: "#f7b955",
  in_conversation: "#38bdf8",
  closed: "#7ff2c8",
};

const COLUMNS = [
  { title: "New", count: 4, color: "#7f92b3" },
  { title: "Contacted", count: 2, color: "#f7b955" },
  { title: "In talk", count: 1, color: "#38bdf8" },
  { title: "Closed", count: 1, color: "#7ff2c8" },
];

function ensureLeafletCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("leaflet-css")) return;
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

function pinHtml(stage: keyof typeof STAGE_COLOR, active: boolean): string {
  const fill = STAGE_COLOR[stage];
  const size = active ? 16 : 12;
  const glow = active ? `0 0 0 5px ${fill}55` : `0 0 0 3px ${fill}40`;
  return `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${fill};box-shadow:${glow};border:2px solid #060a12"></span>`;
}

export function LandingProductPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 2800);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;

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
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
        }).setView([AUSTIN.lat, AUSTIN.lng], 12);

        // Carto dark matter — realistic streets, matches ink palette
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          {
            maxZoom: 19,
            subdomains: "abcd",
          },
        ).addTo(map);

        mapRef.current = map;
        setReady(true);

        const invalidate = () => {
          try {
            map.invalidateSize({ animate: false });
          } catch {
            /* ignore */
          }
        };
        requestAnimationFrame(invalidate);
        setTimeout(invalidate, 120);
        setTimeout(invalidate, 400);

        if (wrapRef.current) {
          ro = new ResizeObserver(invalidate);
          ro.observe(wrapRef.current);
        }
      } catch {
        if (!cancelled) setReady(false);
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
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;

      // Clear previous pin layer (keep tiles)
      mapRef.current.eachLayer((layer) => {
        if (layer instanceof L.Marker) mapRef.current?.removeLayer(layer);
      });

      const active = tick % PINS.length;
      PINS.forEach((p, i) => {
        const icon = L.divIcon({
          className: "leadify-hero-pin",
          html: pinHtml(p.stage, i === active),
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker([p.lat, p.lng], { icon });
        if (i === active) {
          marker.bindTooltip(p.label, {
            permanent: true,
            direction: "top",
            offset: [0, -10],
            className: "leadify-hero-tooltip",
          });
        }
        marker.addTo(mapRef.current!);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [tick, ready]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-aurora-400/15 via-transparent to-amber-400/10 blur-2xl" />

      <div className="overflow-hidden rounded-xl2 border border-white/10 bg-ink-900/80 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="ml-3 text-[11px] uppercase tracking-widest text-mist-500">
            Studio · Austin dental clinics
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-aurora-300">
            <span className="h-1.5 w-1.5 rounded-full bg-aurora-400 pulse-ring" />
            Live search
          </span>
        </div>

        <div className="grid lg:grid-cols-5">
          <div className="relative min-h-[220px] border-b border-white/5 lg:col-span-3 lg:min-h-[340px] lg:border-b-0 lg:border-r lg:border-white/5">
            <div
              ref={mapElRef}
              className="absolute inset-0 h-full w-full [&_.leaflet-tile-pane]:brightness-[0.9] [&_.leaflet-tile-pane]:contrast-[1.05] [&_.leaflet-tile-pane]:saturate-[0.8]"
              aria-hidden
            />
            {!ready && (
              <div className="absolute inset-0 bg-ink-900">
                <div className="absolute inset-0 shimmer opacity-40" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/50 via-transparent to-ink-950/20" />
            <div className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-ink-950/75 px-2.5 py-1.5 text-[10px] text-mist-300 backdrop-blur">
              5 prospects · map by stage
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4 lg:col-span-2">
            <p className="text-[10px] uppercase tracking-widest text-mist-500">Pipeline</p>
            <div className="grid flex-1 grid-cols-2 gap-2">
              {COLUMNS.map((col) => (
                <div
                  key={col.title}
                  className="rounded-xl border border-white/8 bg-ink-950/50 p-3"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: col.color }}
                    />
                    <span className="text-[11px] font-medium text-mist-300">{col.title}</span>
                  </div>
                  <p className="mt-2 font-display text-2xl font-semibold text-mist-100">
                    {col.count}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {Array.from({ length: Math.min(col.count, 2) }).map((_, i) => (
                      <div
                        key={i}
                        className="h-1.5 rounded-full bg-white/8"
                        style={{ width: `${70 - i * 18}%` }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-aurora-400/20 bg-aurora-400/5 px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-aurora-200/90">
                Human approval on every send.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

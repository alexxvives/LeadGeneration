import { NextResponse } from "next/server";
import { getD1Binding } from "@/lib/cf";
import { getGeocodeCache, setGeocodeCache } from "@/lib/geocode-cache";

/**
 * Server-side geocoding proxy.
 *
 * Autocomplete (?suggest=1): Photon by Komoot (no API key).
 * Single geocode (?q=...): Nominatim, with D1-backed durable cache so Worker
 * isolates don't re-hit Nominatim for the same city/street.
 *
 * Modes:
 *  - ?q=...            → { coords: { lat, lng } | null }
 *  - ?q=...&suggest=1  → { suggestions: LocationSuggestion[] }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type LocationSuggestion = {
  label: string;
  value: string;
  lat: number;
  lng: number;
};

type Coords = { lat: number; lng: number };
/** Process-local hot cache (demo / within one isolate). */
const coordCache = new Map<string, Coords | null>();
const suggestCache = new Map<string, LocationSuggestion[]>();

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "HermesMail/0.1 (contact=dev@localhost)",
};

type PhotonFeature = {
  properties: {
    name?: string;
    country?: string;
    state?: string;
    city?: string;
    type?: string;
    osm_type?: string;
  };
  geometry: { coordinates: [number, number] };
};

function photonLabel(p: PhotonFeature["properties"]): string {
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  if (p.state && p.state !== p.name) parts.push(p.state);
  if (p.country && p.country !== p.name) parts.push(p.country);
  return parts.slice(0, 3).join(", ");
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const suggest = params.get("suggest") === "1";

  if (q.length < 2) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  if (suggest) {
    const key = q.toLowerCase();
    if (suggestCache.has(key)) {
      return NextResponse.json({ suggestions: suggestCache.get(key) });
    }
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&layer=city&layer=state&layer=country`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        suggestCache.set(key, []);
        return NextResponse.json({ suggestions: [] });
      }
      const data = (await res.json()) as { features: PhotonFeature[] };

      const seen = new Set<string>();
      const suggestions: LocationSuggestion[] = [];
      for (const f of data.features) {
        const label = photonLabel(f.properties);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        const [lng, lat] = f.geometry.coordinates;
        suggestions.push({ label, value: label, lat, lng });
      }

      suggestCache.set(key, suggestions);
      return NextResponse.json({ suggestions });
    } catch {
      suggestCache.set(key, []);
      return NextResponse.json({ suggestions: [] });
    }
  }

  const key = q.toLowerCase();
  if (coordCache.has(key)) {
    return NextResponse.json({ coords: coordCache.get(key) });
  }

  const d1 = await getD1Binding();
  const durable = await getGeocodeCache(d1, key);
  if (durable !== undefined) {
    coordCache.set(key, durable);
    return NextResponse.json({ coords: durable });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: NOMINATIM_HEADERS,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      coordCache.set(key, null);
      await setGeocodeCache(d1, key, null);
      return NextResponse.json({ coords: null });
    }
    const data = (await res.json()) as { lat: string; lon: string }[];
    const coords = data[0]
      ? { lat: Number(data[0].lat), lng: Number(data[0].lon) }
      : null;
    coordCache.set(key, coords);
    await setGeocodeCache(d1, key, coords);
    return NextResponse.json({ coords });
  } catch {
    coordCache.set(key, null);
    await setGeocodeCache(d1, key, null);
    return NextResponse.json({ coords: null });
  }
}

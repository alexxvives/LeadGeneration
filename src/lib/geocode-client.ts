/**
 * Client-side geocode cache + prefetch (shared by LeadMap + Studio).
 * Nominatim is rate-limited; /api/geocode persists hits in D1.
 */

import { api } from "@/lib/client-api";

export type Coords = { lat: number; lng: number };

const MAX_CITY_GEOCODES = 60;
const STREET_BATCH = 12;
const STREET_BATCH_PAUSE_MS = 350;
const GEOCODE_CONCURRENCY = 3;

const geocodeCache = new Map<string, Coords | null>();
const geocodeInflight = new Map<string, Promise<Coords | null>>();

let prefetchGen = 0;

export function geocodeCandidates(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const parts = q.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [q];
  if (parts.length >= 2) out.push(parts.slice(-2).join(", "));
  if (parts.length >= 3) out.push(parts.slice(-3).join(", "));
  if (parts.length >= 2) {
    const cityish = parts[parts.length - 2]!.replace(/^\d+\s+/, "").trim();
    const country = parts[parts.length - 1]!;
    if (cityish.length >= 2) out.push(`${cityish}, ${country}`);
  }
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

export function cityKey(loc: string): string {
  const parts = loc
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ").toLowerCase();
  return loc.trim().toLowerCase();
}

export function isStreetCandidate(loc: string): boolean {
  if (!loc.includes(",")) return false;
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 3 || /^\d/.test(parts[0] ?? "");
}

export async function geocodeExact(query: string): Promise<Coords | null> {
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

export async function geocode(query: string): Promise<Coords | null> {
  for (const candidate of geocodeCandidates(query)) {
    const coords = await geocodeExact(candidate);
    if (coords) return coords;
  }
  return null;
}

export function peekGeocodeCache(query: string): Coords | null | undefined {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (!geocodeCache.has(key)) return undefined;
  return geocodeCache.get(key)!;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx]!);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * Warm city + street geocodes for lead locations in the background.
 * Safe to call from any view — LeadMap reads the same module cache.
 */
export function prefetchLeadGeocodes(opts: {
  locations: (string | null | undefined)[];
  locationHint?: string | null;
}): void {
  const gen = ++prefetchGen;
  const hint = opts.locationHint?.trim() ?? "";
  const locations = [
    ...new Set(
      opts.locations
        .map((l) => l?.trim() ?? "")
        .filter(Boolean)
        .map((l) => l.toLowerCase()),
    ),
  ];

  void (async () => {
    if (hint) await geocode(hint);
    if (gen !== prefetchGen) return;

    const cities = new Set<string>();
    if (hint) cities.add(cityKey(hint));
    for (const loc of locations) {
      const key = cityKey(loc);
      if (key) cities.add(key);
    }
    const toResolve = [...cities]
      .filter((k) => !geocodeCache.has(k))
      .slice(0, MAX_CITY_GEOCODES);
    if (toResolve.length > 0) {
      await mapPool(toResolve, GEOCODE_CONCURRENCY, async (key) => {
        if (gen !== prefetchGen) return;
        await geocode(key);
      });
    }
    if (gen !== prefetchGen) return;

    const streets: string[] = [];
    const seen = new Set<string>();
    for (const loc of locations) {
      if (!isStreetCandidate(loc) || seen.has(loc)) continue;
      seen.add(loc);
      if (!geocodeCache.has(loc)) streets.push(loc);
    }

    for (let i = 0; i < streets.length; i += STREET_BATCH) {
      if (gen !== prefetchGen) return;
      const batch = streets.slice(i, i + STREET_BATCH);
      await mapPool(batch, GEOCODE_CONCURRENCY, async (loc) => {
        if (gen !== prefetchGen) return;
        await geocode(loc);
      });
      if (i + STREET_BATCH < streets.length) {
        await new Promise((r) => setTimeout(r, STREET_BATCH_PAUSE_MS));
      }
    }
  })();
}

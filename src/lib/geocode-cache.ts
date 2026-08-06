/**
 * Durable geocode lookup cache backed by D1 when available.
 * Falls back to the in-process Map used by /api/geocode (demo / next dev).
 * Keys are lowercased query strings — city or street.
 */
import type { D1Database } from "@/lib/db/d1-store";

export type GeoCoords = { lat: number; lng: number };

/** undefined = miss; null = known empty result; Coords = hit. */
export async function getGeocodeCache(
  db: D1Database | undefined,
  query: string,
): Promise<GeoCoords | null | undefined> {
  const key = query.trim().toLowerCase();
  if (!key || !db) return undefined;
  try {
    const row = await db
      .prepare(
        `SELECT lat, lng, found FROM geocode_cache WHERE query = ? LIMIT 1`,
      )
      .bind(key)
      .first<{ lat: number | null; lng: number | null; found: number }>();
    if (!row) return undefined;
    if (!row.found || row.lat == null || row.lng == null) return null;
    return { lat: row.lat, lng: row.lng };
  } catch {
    return undefined;
  }
}

export async function setGeocodeCache(
  db: D1Database | undefined,
  query: string,
  coords: GeoCoords | null,
): Promise<void> {
  const key = query.trim().toLowerCase();
  if (!key || !db) return;
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO geocode_cache (query, lat, lng, found, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(query) DO UPDATE SET
           lat = excluded.lat,
           lng = excluded.lng,
           found = excluded.found,
           updated_at = excluded.updated_at`,
      )
      .bind(
        key,
        coords?.lat ?? null,
        coords?.lng ?? null,
        coords ? 1 : 0,
        now,
      )
      .run();
  } catch {
    /* table may not exist yet on a stale Worker — ignore */
  }
}

import type { D1Database } from "@/lib/db/d1-store";

/**
 * Resolve the Cloudflare D1 binding at request time.
 *
 * In production (Workers via @opennextjs/cloudflare) this returns
 * `getCloudflareContext().env.DB`. In local `npm run dev` there is no Cloudflare
 * context, so it returns `undefined` and the app falls back to the JSON file
 * store — preserving zero-key demo mode (constitution Art. I.2). To exercise D1
 * locally, use `npm run cf:preview` instead of `npm run dev`.
 *
 * NOTE: @opennextjs/cloudflare exposes `getCloudflareContext()` (the current
 * OpenNext API), not the older `getRequestContext()` from next-on-pages.
 */
export async function getD1Binding(): Promise<D1Database | undefined> {
  // Only bind D1 in the production (Workers) runtime. `next dev` sets
  // NODE_ENV="development"; the OpenNext build sets "production". This keeps
  // `npm run dev` in pure JSON-store demo mode even if a local D1 proxy is
  // available (constitution Art. I.2). Use `npm run cf:preview` for local D1.
  if (process.env.NODE_ENV !== "production") return undefined;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as unknown as { DB?: D1Database }).DB;
    return db ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fixed-window rate limits for password login / register.
 * D1-backed in production; in-memory Map for local JSON demo.
 */

import { getD1Binding } from "@/lib/cf";

type LimitSpec = { max: number; windowMs: number };

const LIMITS = {
  password: { max: 10, windowMs: 15 * 60 * 1000 } satisfies LimitSpec,
  register: { max: 5, windowMs: 60 * 60 * 1000 } satisfies LimitSpec,
} as const;

export type AuthRateKind = keyof typeof LIMITS;

const memory = new Map<string, { count: number; windowStart: number }>();

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export async function checkAuthRateLimit(
  req: Request,
  kind: AuthRateKind,
  email: string,
): Promise<RateLimitResult> {
  const spec = LIMITS[kind];
  const ip = clientIp(req);
  const key = `${kind}|${ip}|${email.trim().toLowerCase()}`;
  const now = Date.now();

  const binding = await getD1Binding();
  if (!binding) {
    const row = memory.get(key);
    if (!row || now - row.windowStart >= spec.windowMs) {
      memory.set(key, { count: 1, windowStart: now });
      return { ok: true };
    }
    if (row.count >= spec.max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((row.windowStart + spec.windowMs - now) / 1000),
      );
      return { ok: false, retryAfterSec };
    }
    row.count += 1;
    return { ok: true };
  }

  const existing = await binding
    .prepare(`SELECT count, window_start AS windowStart FROM auth_rate_limits WHERE key = ?`)
    .bind(key)
    .first<{ count: number; windowStart: string }>();

  const windowStartMs = existing ? Date.parse(existing.windowStart) : NaN;
  if (!existing || !Number.isFinite(windowStartMs) || now - windowStartMs >= spec.windowMs) {
    await binding
      .prepare(
        `INSERT INTO auth_rate_limits (key, count, window_start)
         VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`,
      )
      .bind(key, new Date(now).toISOString())
      .run();
    return { ok: true };
  }

  if (existing.count >= spec.max) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((windowStartMs + spec.windowMs - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }

  await binding
    .prepare(`UPDATE auth_rate_limits SET count = count + 1 WHERE key = ?`)
    .bind(key)
    .run();
  return { ok: true };
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: "Too many attempts. Try again later.",
      retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}

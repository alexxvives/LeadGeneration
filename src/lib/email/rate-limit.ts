import { env } from "@/lib/config";
import type { LeadRepository } from "@/lib/db";

/**
 * Workspace-scoped rolling-window send rate limit.
 *
 * Counts recent `sent` + in-flight `sending` rows in D1/JSON so the limit
 * holds across Cloudflare Worker isolates (unlike an in-memory array).
 */

export interface RateDecision {
  allowed: boolean;
  retryAfterMs: number;
  windowCount: number;
  limit: number;
}

export async function checkSendRate(
  db: LeadRepository,
  excludeOutreachId?: string,
): Promise<RateDecision> {
  const limit = env.sendRatePerMinute();
  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const windowCount = await db.countRecentSendActivity(
    sinceIso,
    excludeOutreachId,
  );
  if (windowCount >= limit) {
    // Best-effort retry hint — next minute boundary.
    return {
      allowed: false,
      retryAfterMs: 15_000,
      windowCount,
      limit,
    };
  }
  return { allowed: true, retryAfterMs: 0, windowCount, limit };
}

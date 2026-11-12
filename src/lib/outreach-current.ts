import type { Outreach, OutreachStatus } from "@/lib/types";

/**
 * A lead may have a sent outreach row (audit trail) plus a later draft for
 * a resend. "Current" is the draft/approved/failed/rejected row when one
 * exists; otherwise the in-flight or last sent message.
 */
export function isOpenOutreachStatus(status: OutreachStatus | string): boolean {
  return status !== "sent" && status !== "sending";
}

export function pickCurrentOutreach<
  T extends { status: string; updatedAt: string; createdAt: string },
>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const rank = (s: string) => (isOpenOutreachStatus(s) ? 0 : 1);
  return [...rows].sort((a, b) => {
    const byOpen = rank(a.status) - rank(b.status);
    if (byOpen !== 0) return byOpen;
    const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    return b.createdAt.localeCompare(a.createdAt);
  })[0]!;
}

/** SQLite ORDER BY that matches pickCurrentOutreach (use with LIMIT 1). */
export const CURRENT_OUTREACH_ORDER_SQL =
  "CASE WHEN status IN ('sent', 'sending') THEN 1 ELSE 0 END ASC, updated_at DESC, created_at DESC";

export function pickCurrentOutreachFromMap(
  rows: Outreach[],
): Map<string, Outreach> {
  const grouped = new Map<string, Outreach[]>();
  for (const o of rows) {
    const list = grouped.get(o.leadId) ?? [];
    list.push(o);
    grouped.set(o.leadId, list);
  }
  const out = new Map<string, Outreach>();
  for (const [leadId, list] of grouped) {
    const current = pickCurrentOutreach(list);
    if (current) out.set(leadId, current);
  }
  return out;
}

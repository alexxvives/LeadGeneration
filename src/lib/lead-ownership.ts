/**
 * Lead creator stamp. While someone else holds the board lock, a collaborator
 * may still add leads and finish filling in (or delete) the ones they just
 * created. The stamp lives in `customFields` so no column is needed.
 */

export const CREATED_BY_FIELD = "__created_by";

/** How long a creator keeps edit rights on their own lead under someone else's lock. */
export const OWN_LEAD_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Reserved `customFields` keys (system data, hidden from search and columns). */
export function isSystemCustomField(key: string): boolean {
  return key.startsWith("__");
}

export function canEditOwnLeadUnderLock(
  lead: { customFields?: Record<string, string>; createdAt?: string | null },
  userId: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!userId) return false;
  if (lead.customFields?.[CREATED_BY_FIELD] !== userId) return false;
  const created = lead.createdAt ? Date.parse(lead.createdAt) : NaN;
  if (!Number.isFinite(created)) return false;
  return now - created < OWN_LEAD_EDIT_WINDOW_MS;
}

/**
 * Keep the creator stamp when a client sends a full `customFields` object
 * (clients never set or clear it).
 */
export function preserveCreatorStamp(
  prev: Record<string, string> | undefined,
  next: Record<string, string>,
): Record<string, string> {
  const out = { ...next };
  delete out[CREATED_BY_FIELD];
  const stamp = prev?.[CREATED_BY_FIELD];
  if (stamp) out[CREATED_BY_FIELD] = stamp;
  return out;
}

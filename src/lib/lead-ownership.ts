/**
 * Lead creator stamp. While someone else holds the board lock, a collaborator
 * may still add leads; those leads stay editable by anyone regardless of the lock. The stamp lives in `customFields` so no column is needed.
 */

export const CREATED_BY_FIELD = "__created_by";

/** Reserved `customFields` keys (system data, hidden from search and columns). */
export function isSystemCustomField(key: string): boolean {
  return key.startsWith("__");
}

/**
 * Leads added while someone else held board control are never lock-bound:
 * anyone can edit or delete them at any time, whoever created them.
 */
export function isLockExemptLead(lead: { customFields?: Record<string, string> }): boolean {
  return Boolean(lead.customFields?.[CREATED_BY_FIELD]);
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

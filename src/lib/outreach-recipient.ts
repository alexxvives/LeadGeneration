import type { OutreachStatus } from "./types";

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/**
 * Lead emails were edited: what should an unsent draft's To become?
 * Returns `undefined` for "leave it". The To is dropped when it pointed at an
 * address the user just removed from the lead (or every email was removed);
 * a custom To that was never one of the lead's emails is kept.
 * Sent / in-flight outreach is an audit trail and is never rewritten.
 */
export function outreachToAfterLeadEmailEdit(
  currentTo: string | null | undefined,
  status: OutreachStatus | string | null | undefined,
  prevEmails: string[],
  nextEmails: string[],
): string | null | undefined {
  if (status === "sent" || status === "sending") return undefined;
  const to = norm(currentTo);
  if (!to) return undefined;
  const next = nextEmails.map((e) => e.trim()).filter(Boolean);
  if (next.some((e) => norm(e) === to)) return undefined;
  const wasLeadEmail = prevEmails.some((e) => norm(e) === to);
  if (!wasLeadEmail && next.length > 0) return undefined;
  return next[0] ?? null;
}

/**
 * Guard outreach subjects so queue/stage chrome and unfilled placeholders
 * cannot go out as the company name (e.g. "Propuesta para To contact").
 */

/** Outreach / Pipeline column titles that must never fill `{company}`. */
export const RESERVED_STAGE_LABELS = [
  "To contact",
  "Contact Draft",
  "Ready to contact",
  "Ready to Contact",
  "In Conversation",
  "Not Interested",
] as const;

export function isReservedStageLabel(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  return RESERVED_STAGE_LABELS.some((label) => label.toLowerCase() === n);
}

/** "To contact" as a phrase, not a substring of "Contacto Contacto". */
const TO_CONTACT_PHRASE = /(^|[^A-Za-zÀ-ÿ])to contact(?![A-Za-zÀ-ÿ])/i;
const UNFILLED_PLACEHOLDER = /\{[a-z][a-z0-9_]*\}/i;
const BARE_PROPUESTA = /^propuesta(\s+para)?\s*$/i;

function nameSlot(subject: string): string {
  const match = subject.match(/\bpara\s+(.+)$/i);
  return (match?.[1] ?? subject).trim();
}

/**
 * Why this subject must not be sent, or null if it looks filled in.
 */
export function outreachSubjectIssue(
  subject: string | null | undefined,
): string | null {
  const text = (subject ?? "").trim();
  if (!text) return "Add a subject before sending.";
  if (UNFILLED_PLACEHOLDER.test(text)) {
    return "Subject still has an unfilled placeholder. Put the company name in before sending.";
  }
  if (TO_CONTACT_PHRASE.test(text) || isReservedStageLabel(nameSlot(text))) {
    return "Subject uses a queue or stage label instead of the company name. Fix the subject before sending.";
  }
  if (BARE_PROPUESTA.test(text)) {
    return "Subject is missing the company name. Fix the subject before sending.";
  }
  return null;
}

/** 2-minute stale "sending" window — keep in sync with claimOutreachForSend. */
export const STALE_SENDING_MS = 2 * 60_000;

export function isStaleSending(
  outreach: { status?: string; updatedAt?: string | null } | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (outreach?.status !== "sending") return false;
  const updated = outreach.updatedAt ? Date.parse(outreach.updatedAt) : NaN;
  if (!Number.isFinite(updated)) return true;
  return nowMs - updated >= STALE_SENDING_MS;
}

/**
 * Provider (or a webhook) marked the row delivered, but Hermes never wrote
 * sentAt / status=sent. Retrying would risk a duplicate send.
 */
export function isAmbiguousProviderSent(
  outreach:
    | {
        status?: string;
        deliveryStatus?: string | null;
        sentAt?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!outreach) return false;
  if (outreach.status === "sent" || outreach.sentAt) return false;
  return outreach.deliveryStatus === "sent" || outreach.deliveryStatus === "replied";
}

export const AMBIGUOUS_SEND_ERROR =
  "This email may already have gone out (the provider marked it sent, but Hermes has no send time). We will not send it again automatically. Check before retrying.";

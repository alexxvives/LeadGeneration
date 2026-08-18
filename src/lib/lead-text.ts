/**
 * Company / contact-name hygiene for scrape + import.
 *
 * Strips emojis and decorative punctuation (quotes, bullets, TM, …).
 * Keeps letters (including ñ and other Latin diacritics), digits, spaces,
 * dots, and hyphens — the characters that actually belong in a name.
 */

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const ZWJ_VS_RE = /[\u200D\uFE0F]/g;
/** Quotes and similar — never part of a company/contact display name. */
const QUOTE_RE = /["“”„‟«»‘’‚‛`´]/g;
/** Everything except letters, marks, digits, space, dot, hyphen. */
const JUNK_RE = /[^\p{L}\p{M}\p{N}\s.\-]/gu;

export function sanitizeLeadName(raw: string): string {
  const s = raw
    .normalize("NFKC")
    .replace(EMOJI_RE, "")
    .replace(ZWJ_VS_RE, "")
    .replace(QUOTE_RE, "")
    .replace(JUNK_RE, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\.+/g, ".")
    .trim()
    // Keep trailing dots (S.L. / S.A.); only strip dangling hyphens.
    .replace(/^[-\s]+|[-\s]+$/g, "");
  return s;
}

export function sanitizeCompanyName(raw: string): string {
  return sanitizeLeadName(raw) || "Unknown company";
}

export function sanitizeContactName(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  return sanitizeLeadName(raw) || null;
}

export function cleanLeadIdentity<
  T extends { company: string; contactName?: string | null },
>(lead: T): T {
  const company = sanitizeCompanyName(lead.company);
  const contactName = sanitizeContactName(lead.contactName ?? null);
  if (company === lead.company && contactName === (lead.contactName ?? null)) {
    return lead;
  }
  return { ...lead, company, contactName };
}

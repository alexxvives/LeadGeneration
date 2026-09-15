/**
 * Recipient address hygiene. Resend/SMTP reject anything that is not
 * `email@example.com` or `"Name" <email@example.com>`. Placeholder scrapes
 * like `your@email` have no TLD and must be dropped, not sent.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,24}$/;

const PLACEHOLDER_LOCAL_RE =
  /^(your|email|name|user|test|example|sample|me|mail|placeholder|xxx|nobody|n\/a|na)$/i;

const JUNK_EMAIL_HINTS = [
  "example.com",
  "example.org",
  "example.net",
  "sentry.io",
  "wixpress.com",
  "domain.com",
  "yourdomain.com",
  "email.com",
];

export function isSendableEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e || e.length > 254 || !EMAIL_SHAPE.test(e)) return false;
  const at = e.indexOf("@");
  if (at <= 0 || e.indexOf("@", at + 1) !== -1) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (
    !local ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return false;
  }
  if (domain.includes("..") || domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }
  if (PLACEHOLDER_LOCAL_RE.test(local)) return false;
  if (JUNK_EMAIL_HINTS.some((j) => e.includes(j))) return false;
  return true;
}

/** Bare address from `email`, `Name <email>`, or `"Name" <email>`. */
export function parseRecipientEmail(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().replace(/^mailto:/i, "");
  if (!t) return null;
  const angle = t.match(/<([^<>]+)>/);
  const candidate = (angle?.[1] ?? t).trim();
  const email = candidate.toLowerCase();
  return isSendableEmail(email) ? email : null;
}

export function sanitizeEmailList(emails: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of emails) {
    const e = parseRecipientEmail(raw);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/**
 * RFC 5322 mailbox. Quote the display name when it has dots (Dr.) or
 * other specials so providers don't parse `Dr. Name <a@b.c>` as invalid.
 */
export function formatMailbox(
  email: string,
  displayName?: string | null,
): string {
  const name = displayName?.trim();
  if (!name) return email;
  if (/^[A-Za-z0-9 ]+$/.test(name)) return `${name} <${email}>`;
  const quoted = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${quoted}" <${email}>`;
}

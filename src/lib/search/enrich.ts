// Lightweight extraction helpers used to turn scraped page text/markdown into
// contact hints. Intentionally conservative to avoid capturing junk.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Matches common US-style and international-ish phone formats.
const PHONE_RE = /(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

const JUNK_EMAIL_HINTS = [
  "example.com",
  "sentry.io",
  "wixpress.com",
  ".png",
  ".jpg",
  ".gif",
  ".webp",
  ".svg",
  "@2x",
];

export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_RE) ?? [];
  const clean = found
    .map((e) => e.toLowerCase().trim())
    .filter((e) => !JUNK_EMAIL_HINTS.some((j) => e.includes(j)));
  return dedupe(clean).slice(0, 5);
}

export function extractPhones(text: string): string[] {
  const found = text.match(PHONE_RE) ?? [];
  const clean = found
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, "").length >= 10);
  return dedupe(clean).slice(0, 3);
}

/** Grab a short, human-readable blurb from markdown/plain text. */
export function extractBlurb(text: string, max = 240): string | null {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~\-]{1,}/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
  const blurb = (sentences[0] ?? cleaned).slice(0, max).trim();
  return blurb.length > 0 ? blurb : null;
}

export function domainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Best-effort company name from a page title or domain. */
export function companyFromTitleOrUrl(title: string | null, url: string | null): string {
  if (title) {
    const cut = title.split(/[|\-–—:·]/)[0]?.trim();
    if (cut && cut.length > 1 && cut.length < 60) return cut;
  }
  const domain = domainFromUrl(url);
  if (domain) {
    const base = domain.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return "Unknown company";
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

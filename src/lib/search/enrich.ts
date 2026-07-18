// Lightweight extraction helpers used to turn scraped page text/markdown into
// contact hints. Intentionally conservative to avoid capturing junk.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Matches common US-style and international-ish phone formats.
const PHONE_RE = /(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

// US-ish street addresses: "123 Main St, Austin, TX 78701"
const ADDRESS_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.'\- ]{2,40}\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)\.?(?:\s*,\s*[A-Za-z .'­-]{2,40})?(?:\s*,\s*[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?\b/gi;

// EU / intl-style: "Carrer de la Marina 16, 08005 Barcelona" or "12 Rue de Rivoli, 75001 Paris"
const INTL_ADDRESS_RE =
  /\b(?:\d{1,5}\s+)?(?:Carrer|Calle|Avenida|Avda\.?|Rue|Via|Strasse|Straße|Road|Street|Camino|Plaza|Plaça|Passeig|Paseo)\s+[A-Za-zÀ-ÿ0-9.'\- ]{2,50}(?:,?\s*\d{1,5})?(?:,?\s*\d{4,6})?(?:,?\s*[A-Za-zÀ-ÿ .'­-]{2,40})?\b/gi;

// "City, ST" or "City, State"
const CITY_STATE_RE =
  /\b([A-Z][a-zA-Z.'\-]+(?:\s+[A-Z][a-zA-Z.'\-]+){0,2}),\s*([A-Z]{2})\b(?:\s+\d{5})?/g;

// Valid US state / territory + Canadian province two-letter codes. Used to
// reject false "City, XX" matches like "Monday, FR" or "Learn, MO<re>".
const REGION_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
  "PR", "GU", "VI",
  // Canadian provinces / territories (common in NA local search).
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]);

const JUNK_EMAIL_HINTS = [
  "example.com",
  "example.org",
  "example.net",
  "sentry.io",
  "wixpress.com",
  "domain.com",
  "yourdomain.com",
  "email.com",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  "@2x",
];

// Disposable / throwaway mailbox domains — never useful for outreach.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "throwawaymail.com",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
]);

// Local-parts that are auto/no-reply mailboxes — filtered out as un-contactable.
const NOREPLY_LOCAL_RE = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce)/i;

// Conservative shape check on top of the loose scan regex: exactly one @, a dot
// in the domain, a 2–24 alpha TLD, and no doubled/edge dots.
function isPlausibleEmail(email: string): boolean {
  const at = email.indexOf("@");
  if (at <= 0 || email.indexOf("@", at + 1) !== -1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return false;
  }
  if (domain.includes("..") || domain.startsWith(".") || domain.endsWith(".")) return false;
  const tld = domain.split(".").pop() ?? "";
  if (!/^[a-z]{2,24}$/.test(tld)) return false;
  return domain.includes(".");
}

export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_RE) ?? [];
  const clean = found
    .map((e) => e.toLowerCase().trim().replace(/[.,;:)]+$/, ""))
    .filter((e) => !JUNK_EMAIL_HINTS.some((j) => e.includes(j)))
    .filter(isPlausibleEmail)
    .filter((e) => {
      const [local, domain] = e.split("@");
      if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return false;
      if (NOREPLY_LOCAL_RE.test(local)) return false;
      return true;
    });
  // Personal/role inboxes (e.g. jane@, sales@) before generic catch-alls
  // (info@, hello@) so the most contactable address is the primary one.
  const generic = new Set(["info", "hello", "contact", "admin", "office", "team", "support"]);
  const ranked = dedupe(clean).sort((a, b) => {
    const ga = generic.has(a.split("@")[0]) ? 1 : 0;
    const gb = generic.has(b.split("@")[0]) ? 1 : 0;
    return ga - gb;
  });
  return ranked.slice(0, 5);
}

export function extractPhones(text: string): string[] {
  const found = text.match(PHONE_RE) ?? [];
  const clean = found
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, "").length >= 10);
  return dedupe(clean).slice(0, 3);
}

/**
 * Best-effort physical address / city from page text. Prefers a full street
 * address; falls back to "City, ST". Returns null when nothing reliable.
 */
export function extractLocation(text: string): string | null {
  if (!text) return null;
  for (const raw of text.match(ADDRESS_RE) ?? []) {
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (cleaned.length >= 12 && cleaned.length < 140) return cleaned;
  }
  for (const raw of text.match(INTL_ADDRESS_RE) ?? []) {
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (cleaned.length >= 14 && cleaned.length < 140) return cleaned;
  }
  // "City, ST" — only accept when ST is a real region code, which filters out
  // false positives from prose ("Learn more, WE...", "Monday, FR").
  CITY_STATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITY_STATE_RE.exec(text)) !== null) {
    const code = m[2].toUpperCase();
    if (!REGION_CODES.has(code)) continue;
    const label = `${m[1]}, ${code}`.replace(/\s+/g, " ").trim();
    if (label.length >= 5) return label;
  }
  return null;
}

/** @deprecated Import from `@/lib/format-location` — kept for older call sites. */
export { shortLocation } from "@/lib/format-location";

/** True when a sentence is cookie/privacy/consent chrome, not company about-copy. */
function isJunkBlurbSentence(s: string): boolean {
  return /^(skip to|cookie|accept all|we use cookies|we use online identifiers|privacy policy|all rights reserved|sign in|log in|menu|home\b|copyright|manage (your )?consent|this website uses|by (continuing|using|clicking)|personalize your experience|tailor and measure ads|based on your browsing|necessary cookies|strictly necessary)/i.test(
    s,
  ) || /\b(cookie (policy|preferences|settings)|gdpr|online identifiers|browsing habits|measure ads|advertising partners)\b/i.test(
    s,
  );
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

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && !isJunkBlurbSentence(s));
  const blurb = (sentences[0] ?? (isJunkBlurbSentence(cleaned) ? null : cleaned))
    ?.slice(0, max)
    .trim();
  return blurb && blurb.length > 0 ? blurb : null;
}

export function domainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Generic page-title segments that name a page, not the company. When a title
// segment is (only) one of these we skip it in favour of a real brand segment
// or the domain — so "Contact Us | Bright Dental" yields "Bright Dental".
const GENERIC_TITLE_SEGMENTS = new Set([
  "home", "homepage", "home page", "welcome", "contact", "contact us",
  "contacts", "about", "about us", "services", "our services", "products",
  "shop", "blog", "news", "menu", "index", "untitled", "gallery", "portfolio",
  "pricing", "faq", "faqs", "team", "our team", "location", "locations",
  "book now", "booking", "appointments", "get a quote", "request a quote",
  "privacy policy", "terms", "login", "sign in", "404", "page not found",
]);

function isGenericSegment(seg: string): boolean {
  const norm = seg.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return norm.length === 0 || GENERIC_TITLE_SEGMENTS.has(norm);
}

/** Title-case a domain base like "bright-dental" → "Bright Dental". */
function prettifyDomainBase(base: string): string {
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Best-effort company name from a page title or domain.
 *
 * Splits the title on common separators and picks the first segment that names
 * a brand (not a generic page like "Contact Us"). Falls back to a prettified
 * domain so we never surface junk like "Home" or "Contact" as a company.
 */
export function companyFromTitleOrUrl(title: string | null, url: string | null): string {
  if (title) {
    const segments = title
      .split(/\s*[|\-–—:·•>»]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const branded = segments.find((s) => !isGenericSegment(s) && s.length > 1 && s.length < 60);
    if (branded) return branded;
  }
  const domain = domainFromUrl(url);
  if (domain) {
    const base = domain.split(".")[0] ?? domain;
    const pretty = prettifyDomainBase(base);
    if (pretty) return pretty;
  }
  return "Unknown company";
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

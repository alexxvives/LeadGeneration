/**
 * Normalize / display helpers for lead websites.
 * Guards against bad Excel imports that once stored "[object Object]".
 */

/** Consumer inboxes — never invent company/website from these domains. */
const FREE_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.es",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "gmx.com",
  "gmx.es",
  "yandex.com",
  "zoho.com",
]);

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const d = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  return d.includes(".") ? d : null;
}

export function isFreeMailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return FREE_MAIL_HOSTS.has(domain.toLowerCase().replace(/^www\./, ""));
}

/** Business-domain homepage guess from email — never gmail.com etc. */
export function websiteFromEmail(email: string | null | undefined): string | null {
  const d = emailDomain(email);
  if (!d || isFreeMailDomain(d)) return null;
  return `https://${d}`;
}

/** Weak company guess from business email domain only (import fallback). */
export function companyGuessFromEmail(email: string | null | undefined): string | null {
  const d = emailDomain(email);
  if (!d || isFreeMailDomain(d)) return null;
  const slug = d.split(".")[0]?.trim();
  if (!slug || slug.length < 2) return null;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function isUsableWebsite(website: string | null | undefined): boolean {
  const w = website?.trim() ?? "";
  if (!w || /\[object\s+Object\]/i.test(w)) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.includes(".")) return false;
    // Import once invented https://gmail.com from @gmail.com — reject that class.
    if (isFreeMailDomain(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Hostname (+ path if not `/`) for UI, or null when missing/junk. */
export function displayWebsite(website: string | null | undefined): string | null {
  if (!isUsableWebsite(website)) return null;
  const w = website!.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export function normalizeWebsiteUrl(website: string | null | undefined): string | null {
  if (!isUsableWebsite(website)) return null;
  const w = website!.trim();
  try {
    return new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).toString();
  } catch {
    return null;
  }
}

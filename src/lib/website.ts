/**
 * Normalize / display helpers for lead websites.
 * Guards against bad Excel imports that once stored "[object Object]".
 */

export function isUsableWebsite(website: string | null | undefined): boolean {
  const w = website?.trim() ?? "";
  if (!w || /\[object\s+Object\]/i.test(w)) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    return u.hostname.includes(".");
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

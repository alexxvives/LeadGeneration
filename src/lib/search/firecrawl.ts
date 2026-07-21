import { env } from "@/lib/config";
import { extractEmails } from "./enrich";
import type { PageResult, SearchProvider } from "./providers";

// Firecrawl live search + scrape.
// Per hit: landing header/footer first (often has email/phone already) →
// only if still no email, try /contacto then /contact. Never use /map.
//
// COMPLIANCE: public pages only — never authenticate into a target site.
//
// Credits: scrape = 1/page, search ≈ 2/10 results. Path *strings* are free;
// each scrape attempt still costs 1 credit (including empty/404 pages).

const FIRECRAWL_SEARCH = "https://api.firecrawl.dev/v1/search";
const FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v1/scrape";
const FIRECRAWL_CREDITS = "https://api.firecrawl.dev/v1/team/credit-usage";

/** Contact path scrapes before falling back to the landing page. */
const MAX_CONTACT_PATH_SCRAPES = 2;

interface FirecrawlItem {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
  content?: string;
  metadata?: { title?: string; description?: string };
}

interface ScrapeResult {
  markdown: string;
}

async function firecrawlFetch(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.firecrawlKey()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
}

/** Remaining Firecrawl credits for the API key team (null if unavailable). */
export async function getFirecrawlRemainingCredits(): Promise<number | null> {
  const key = env.firecrawlKey();
  if (!key) return null;
  try {
    const res = await fetch(FIRECRAWL_CREDITS, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    // API returns snake_case (`remaining_credits`); accept camelCase too.
    const json = (await res.json()) as {
      data?: { remaining_credits?: number; remainingCredits?: number };
      remaining_credits?: number;
      remainingCredits?: number;
    };
    const n =
      json.data?.remaining_credits ??
      json.data?.remainingCredits ??
      json.remaining_credits ??
      json.remainingCredits;
    return typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : null;
  } catch {
    return null;
  }
}

/**
 * Full-page markdown — keep header/footer (emails/phones/address often live there).
 */
async function scrapePage(pageUrl: string): Promise<ScrapeResult> {
  try {
    const res = await firecrawlFetch(FIRECRAWL_SCRAPE, {
      url: pageUrl,
      formats: ["markdown"],
      onlyMainContent: false,
    });
    if (!res.ok) return { markdown: "" };
    const json = (await res.json()) as {
      data?: { markdown?: string; content?: string };
    };
    return {
      markdown: json.data?.markdown ?? json.data?.content ?? "",
    };
  } catch {
    return { markdown: "" };
  }
}

function originOf(pageUrl: string): string | null {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return null;
  }
}

function normalizeUrl(u: string): string {
  return u.split("#")[0]!.replace(/\/+$/, "");
}

/**
 * Same-origin contact URLs from landing markdown links (free — no API call).
 * Prefer these before guessing paths so we don't burn credits on 404s.
 */
function contactUrlsFromMarkdown(pageUrl: string, markdown: string): string[] {
  const origin = originOf(pageUrl);
  if (!origin || !markdown) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const mdLinkRe = /\[[^\]]{0,80}\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRe.exec(markdown)) !== null) {
    const href = m[1];
    const label = m[0].slice(1, m[0].indexOf("]")).toLowerCase();
    const hrefLow = href.toLowerCase();
    if (
      !/contact|contacto|get in touch|email|reach/i.test(label) &&
      !/contact|contacto|get-in-touch/i.test(hrefLow)
    ) {
      continue;
    }
    try {
      const abs: string = href.startsWith("http")
        ? href
        : new URL(href, origin).href;
      if (new URL(abs).origin !== origin) continue;
      const key = normalizeUrl(abs).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(abs.split("#")[0]!);
    } catch {
      /* bad href */
    }
  }
  return out;
}

/**
 * Fallback contact paths after landing miss — /contacto first (ES/LATAM),
 * then /contact. Path strings are free; each scrape still costs 1 credit.
 * Do not guess /about|/team — low email yield, wastes credits.
 */
function guessedContactPaths(pageUrl: string): string[] {
  const origin = originOf(pageUrl);
  if (!origin) return [];
  return ["/contacto", "/contact"].map((p) => `${origin}${p}`);
}

function mergeContent(base: string, extra: string): string {
  const e = extra.trim();
  if (!e) return base;
  if (!base.trim()) return e;
  return `${base.trim()}\n\n---\n\n${e}`;
}

/**
 * Landing header/footer first (blurb + address + often email/phone) →
 * /contacto then /contact only if still no email.
 * Always keep whatever contact we find. Never drops for missing email.
 */
export async function enrichFirecrawlPage(page: PageResult): Promise<void> {
  let merged = page.content ?? "";

  // Search snippet already has an email — keep phones/address from it; done.
  if (extractEmails(merged).length > 0) {
    page.content = merged;
    return;
  }

  // Homepage first — one credit; often enough for email + phone + address.
  const landing = await scrapePage(page.url);
  if (landing.markdown) {
    merged = mergeContent(merged, landing.markdown);
  }
  if (extractEmails(merged).length > 0) {
    page.content = merged;
    return;
  }

  // No email on landing → linked contact pages first, then /contacto|/contact.
  const landingKey = normalizeUrl(page.url).toLowerCase();
  const fromLinks = contactUrlsFromMarkdown(page.url, merged);
  const guessed = guessedContactPaths(page.url);
  const paths: string[] = [];
  const seenPath = new Set<string>();
  for (const u of [...fromLinks, ...guessed]) {
    const key = normalizeUrl(u).toLowerCase();
    if (key === landingKey || seenPath.has(key)) continue;
    seenPath.add(key);
    paths.push(u);
    if (paths.length >= MAX_CONTACT_PATH_SCRAPES) break;
  }

  for (const url of paths) {
    const extra = await scrapePage(url);
    if (!extra.markdown) continue; // likely 404 / empty — still spent 1 credit
    merged = mergeContent(merged, extra.markdown);
    if (extractEmails(merged).length > 0) break;
  }

  page.content = merged;
}

export function firecrawlProvider(): SearchProvider {
  return {
    name: "firecrawl",
    async search(query: string, limit: number): Promise<PageResult[]> {
      const res = await firecrawlFetch(FIRECRAWL_SEARCH, { query, limit });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Firecrawl search failed (${res.status}): ${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as { data?: FirecrawlItem[] };
      return (json.data ?? [])
        .filter((it) => it.url)
        .map((it) => ({
          url: it.url as string,
          title: it.title ?? it.metadata?.title ?? null,
          description: it.description ?? it.metadata?.description ?? null,
          content: it.markdown ?? it.content ?? "",
        }));
    },
  };
}

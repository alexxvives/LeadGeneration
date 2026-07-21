/**
 * Best-effort plain text from a public URL for pitch generation / on-demand enrich.
 * Prefers Firecrawl when configured; otherwise a plain fetch + tag strip.
 */

import { env } from "@/lib/config";

/** Reject non-public targets before fetch (SSRF hardening — audit A16). */
export function assertPublicHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    throw new Error("Localhost URLs are not allowed");
  }
  // IPv4 literal private / link-local / loopback ranges.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31)
    ) {
      throw new Error("Private network URLs are not allowed");
    }
  }
  return parsed;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function plainFetchPageText(url: string): Promise<string> {
  assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "HermesMail/0.1 (+https://leadgeneration.alexxvives.workers.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Could not fetch website (${res.status})`);
    }
    const html = await res.text();
    const text = stripHtml(html);
    if (text.length < 40) {
      throw new Error("Website returned too little text to generate a pitch.");
    }
    return text.slice(0, 8000);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param preferPlain — skip Firecrawl (import enrich): saves scrape credits;
 *   AI tokens are tiny; Firecrawl is the costly bit at volume.
 */
export async function fetchPublicPageText(
  url: string,
  opts?: { preferPlain?: boolean },
): Promise<string> {
  assertPublicHttpUrl(url);
  const key = opts?.preferPlain ? "" : env.firecrawlKey();
  if (key) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { markdown?: string; content?: string };
        };
        const md = json.data?.markdown || json.data?.content || "";
        if (md.trim().length > 40) return md.trim().slice(0, 8000);
      }
    } catch (err) {
      console.warn("[fetch-page] Firecrawl scrape failed:", err);
    }
  }

  return plainFetchPageText(url);
}

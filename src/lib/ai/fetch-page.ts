/**
 * Best-effort plain text from a public URL for pitch generation / import enrich.
 * Prefers Firecrawl when configured; otherwise a plain fetch + tag strip.
 */

import { env } from "@/lib/config";

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "LeadifyLeadGen/0.1 (+https://leadgeneration.alexxvives.workers.dev)",
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

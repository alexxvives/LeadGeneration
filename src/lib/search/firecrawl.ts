import { env } from "@/lib/config";
import type { PageResult, SearchProvider } from "./providers";

// Firecrawl live search + scrape.
// Prefer /v1/search WITHOUT scrapeOptions.formats (Firecrawl guidance + avoids
// format-validation errors on some plans), then scrape markdown for top hits.
//
// COMPLIANCE: public pages only — never authenticate into a target site.

const FIRECRAWL_SEARCH = "https://api.firecrawl.dev/v1/search";
const FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v1/scrape";

interface FirecrawlItem {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
  content?: string;
  metadata?: { title?: string; description?: string };
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

async function scrapeMarkdown(pageUrl: string): Promise<string> {
  try {
    const res = await firecrawlFetch(FIRECRAWL_SCRAPE, {
      url: pageUrl,
      formats: ["markdown"],
      onlyMainContent: true,
    });
    if (!res.ok) return "";
    const json = (await res.json()) as {
      data?: { markdown?: string; content?: string };
    };
    return json.data?.markdown ?? json.data?.content ?? "";
  } catch {
    return "";
  }
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
      const mapped = (json.data ?? [])
        .filter((it) => it.url)
        .map((it) => ({
          url: it.url as string,
          title: it.title ?? it.metadata?.title ?? null,
          description: it.description ?? it.metadata?.description ?? null,
          content: it.markdown ?? it.content ?? "",
        }));

      // Enrich top hits so email/phone extraction still has page body text.
      const enrichCount = Math.min(mapped.length, Math.min(limit, 6));
      for (let i = 0; i < enrichCount; i++) {
        const page = mapped[i]!;
        if (page.content) continue;
        page.content = await scrapeMarkdown(page.url);
      }

      return mapped;
    },
  };
}

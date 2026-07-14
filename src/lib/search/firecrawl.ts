import { env } from "@/lib/config";
import type { PageResult, SearchProvider } from "./providers";

// Firecrawl live search + scrape.
// Docs: https://docs.firecrawl.dev — we use the /v1/search endpoint which can
// optionally scrape each result to markdown in one call, giving us page content
// to extract contact hints from.
//
// COMPLIANCE: We only search public web pages and never authenticate into a
// target site. Do not point this at content behind a login.

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/search";

interface FirecrawlItem {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
  content?: string;
  metadata?: { title?: string; description?: string };
}

export function firecrawlProvider(): SearchProvider {
  return {
    name: "firecrawl",
    async search(query: string, limit: number): Promise<PageResult[]> {
      const res = await fetch(FIRECRAWL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.firecrawlKey()}`,
        },
        body: JSON.stringify({
          query,
          limit,
          scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
        }),
        // Firecrawl scraping can be slow; give it room but don't hang forever.
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Firecrawl search failed (${res.status}): ${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as { success?: boolean; data?: FirecrawlItem[] };
      const items = json.data ?? [];
      return items
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

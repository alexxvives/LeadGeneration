import { env } from "@/lib/config";
import type { PageResult, SearchProvider } from "./providers";

// Exa live search. Docs: https://docs.exa.ai
// We request text contents so we can extract contact hints. Used as a fallback
// / alternative to Firecrawl.
//
// COMPLIANCE: public web results only; never target login-gated content.

const EXA_ENDPOINT = "https://api.exa.ai/search";

interface ExaResult {
  url?: string;
  title?: string;
  text?: string;
  summary?: string;
}

export function exaProvider(): SearchProvider {
  return {
    name: "exa",
    async search(query: string, limit: number): Promise<PageResult[]> {
      const res = await fetch(EXA_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.exaKey(),
        },
        body: JSON.stringify({
          query,
          numResults: limit,
          type: "auto",
          contents: { text: { maxCharacters: 2000 }, summary: true },
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Exa search failed (${res.status}): ${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as { results?: ExaResult[] };
      const items = json.results ?? [];
      return items
        .filter((it) => it.url)
        .map((it) => ({
          url: it.url as string,
          title: it.title ?? null,
          description: it.summary ?? null,
          content: it.text ?? it.summary ?? "",
        }));
    },
  };
}

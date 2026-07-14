import { env, getCapabilities } from "@/lib/config";
import { scoreLead, type RawLead } from "@/lib/fit-score";
import type { CreateRunInput } from "@/lib/types";
import { demoLeads } from "./demo";
import {
  companyFromTitleOrUrl,
  domainFromUrl,
  extractBlurb,
  extractEmails,
  extractLocation,
  extractPhones,
} from "./enrich";
import { exaProvider } from "./exa";
import { firecrawlProvider } from "./firecrawl";
import type { PageResult, SearchProvider } from "./providers";
import { buildQueries } from "./query";

export { buildQuery } from "./query";

export interface ScoredLead extends RawLead {
  sourceUrl: string;
  fitScore: number;
  fitReasons: string[];
  contactName: string | null;
}

export interface SearchOutcome {
  provider: string;
  mode: "demo" | "live";
  leads: ScoredLead[];
  /** Human-readable reason when a live search produced no leads. */
  emptyReason?: string;
}

export class SearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchUnavailableError";
  }
}

function pickProvider(): SearchProvider | null {
  const caps = getCapabilities();
  if (caps.firecrawl) return firecrawlProvider();
  if (caps.exa) return exaProvider();
  return null;
}

function pageToRawLead(page: PageResult, input: CreateRunInput): RawLead {
  const haystack = `${page.title ?? ""}\n${page.description ?? ""}\n${page.content}`;
  const scrapedLocation = extractLocation(haystack);
  return {
    company: companyFromTitleOrUrl(page.title, page.url),
    website: domainFromUrl(page.url) ? `https://${domainFromUrl(page.url)}` : page.url,
    emails: extractEmails(haystack),
    phones: extractPhones(haystack),
    // Prefer a page-scraped address; fall back to the search Location field.
    location: scrapedLocation || input.location?.trim() || null,
    aboutBlurb: extractBlurb(page.content || page.description || "") ?? page.description ?? null,
    tags: [input.niche.split(/\s+/)[0]?.toLowerCase() ?? "lead"],
  };
}

function finalize(raw: RawLead, sourceUrl: string, input: CreateRunInput): ScoredLead {
  const { score, reasons } = scoreLead(raw, input);
  return { ...raw, sourceUrl, fitScore: score, fitReasons: reasons, contactName: null };
}

function urlKey(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

async function collectPages(
  provider: SearchProvider,
  queries: string[],
  limit: number,
): Promise<PageResult[]> {
  const byUrl = new Map<string, PageResult>();
  for (const query of queries) {
    try {
      const pages = await provider.search(query, limit);
      for (const page of pages) {
        const key = urlKey(page.url);
        if (!byUrl.has(key)) byUrl.set(key, page);
      }
    } catch (err) {
      console.error(`[search] ${provider.name} query failed ("${query}"):`, err);
    }
  }
  return [...byUrl.values()];
}

/**
 * Run search + enrichment.
 *
 * Demo leads are returned ONLY when `input.demo === true` (Load demo data).
 * Live searches never silently fall back to demo — empty/missing providers
 * surface a clear error so the board stays empty until the user chooses.
 */
export async function runSearch(input: CreateRunInput): Promise<SearchOutcome> {
  const limit = env.maxLeadsPerRun();

  if (input.demo) {
    const demo = demoLeads(input, limit).map((raw, i) =>
      finalize(raw, raw.website ?? `https://demo.example.com/${i}`, input),
    );
    return { provider: "demo", mode: "demo", leads: demo };
  }

  const strategy = input.searchStrategy ?? "standard";
  const queries = buildQueries(input, strategy);
  const multiQuery = queries.length > 1;
  const provider = pickProvider();

  if (!provider) {
    throw new SearchUnavailableError(
      "No search provider configured. Add FIRECRAWL_API_KEY or EXA_API_KEY, or click “Load demo data”.",
    );
  }

  const pages = await collectPages(provider, queries, limit);
  if (pages.length === 0) {
    return {
      provider: provider.name,
      mode: "live",
      leads: [],
      emptyReason: "Search returned no usable pages. Try a broader niche or different location.",
    };
  }

  const seen = new Set<string>();
  const leads = pages
    .map((p) => finalize(pageToRawLead(p, input), p.url, input))
    .filter((l) => {
      const key = domainFromUrl(l.website) ?? l.company;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const ranked = multiQuery
    ? leads.sort((a, b) => b.fitScore - a.fitScore).slice(0, limit)
    : leads;
  return { provider: provider.name, mode: "live", leads: ranked };
}

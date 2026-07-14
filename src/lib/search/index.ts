import { env, getCapabilities } from "@/lib/config";
import { scoreLead, type RawLead } from "@/lib/fit-score";
import type { CreateRunInput } from "@/lib/types";
import { demoLeads } from "./demo";
import {
  companyFromTitleOrUrl,
  domainFromUrl,
  extractBlurb,
  extractEmails,
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
}

function pickProvider(): SearchProvider | null {
  const caps = getCapabilities();
  // Prefer Firecrawl (scrapes full page content) then Exa.
  if (caps.firecrawl) return firecrawlProvider();
  if (caps.exa) return exaProvider();
  return null;
}

function pageToRawLead(page: PageResult, input: CreateRunInput): RawLead {
  const haystack = `${page.title ?? ""}\n${page.description ?? ""}\n${page.content}`;
  return {
    company: companyFromTitleOrUrl(page.title, page.url),
    website: domainFromUrl(page.url) ? `https://${domainFromUrl(page.url)}` : page.url,
    emails: extractEmails(haystack),
    phones: extractPhones(haystack),
    location: input.location?.trim() || null,
    aboutBlurb: extractBlurb(page.content || page.description || "") ?? page.description ?? null,
    tags: [input.niche.split(/\s+/)[0]?.toLowerCase() ?? "lead"],
  };
}

function finalize(raw: RawLead, sourceUrl: string, input: CreateRunInput): ScoredLead {
  const { score, reasons } = scoreLead(raw, input);
  return { ...raw, sourceUrl, fitScore: score, fitReasons: reasons, contactName: null };
}

/** Normalize a URL for dedup (drop protocol, trailing slash, and #fragment). */
function urlKey(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/**
 * Run every query for the chosen strategy against the live provider, merging
 * the results. Queries run sequentially so a single upstream 429 doesn't
 * cascade, and a failure on one variant doesn't sink the whole run. Returns the
 * deduped page set, or an empty array if the provider produced nothing usable.
 */
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
 * Run search + enrichment. Uses a live provider when a key is present, and
 * gracefully falls back to demo data if no key exists OR the live call fails.
 *
 * `smart`/`local` strategies expand the ICP into several queries (more
 * provider calls / credits) and rank the merged, deduped results by fit score.
 */
export async function runSearch(input: CreateRunInput): Promise<SearchOutcome> {
  const limit = env.maxLeadsPerRun();
  const strategy = input.searchStrategy ?? "standard";
  const queries = buildQueries(input, strategy);
  const multiQuery = queries.length > 1;
  const provider = pickProvider();

  if (provider) {
    const pages = await collectPages(provider, queries, limit);
    if (pages.length > 0) {
      const seen = new Set<string>();
      const leads = pages
        .map((p) => finalize(pageToRawLead(p, input), p.url, input))
        .filter((l) => {
          const key = domainFromUrl(l.website) ?? l.company;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      // For expanded searches, surface the strongest fits first and cap to the
      // per-run limit (single-query keeps the provider's native ranking).
      const ranked = multiQuery
        ? leads.sort((a, b) => b.fitScore - a.fitScore).slice(0, limit)
        : leads;
      return { provider: provider.name, mode: "live", leads: ranked };
    }
    // Live provider returned nothing — fall through to demo so the UI is usable.
  }

  const demo = demoLeads(input, limit).map((raw, i) =>
    finalize(raw, raw.website ?? `https://demo.example.com/${i}`, input),
  );
  return { provider: "demo", mode: "demo", leads: demo };
}

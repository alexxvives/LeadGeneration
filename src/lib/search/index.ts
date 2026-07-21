import { env, getCapabilities } from "@/lib/config";
import { aiAvailable } from "@/lib/ai/chat";
import { generateLeadBlurb, mapPool, scoreLeadPitchFit } from "@/lib/ai/generate";
import { scoreLead, type RawLead } from "@/lib/fit-score";
import type { CreateRunInput, SearchStrategy } from "@/lib/types";
import { demoLeads } from "./demo";
import {
  companyFromTitleOrUrl,
  domainFromUrl,
  extractBlurb,
  extractContactName,
  extractEmails,
  extractLocation,
  extractPhones,
} from "./enrich";
import { enrichFirecrawlPage, firecrawlProvider } from "./firecrawl";
import type { PageResult, SearchProvider } from "./providers";
import { buildQueries } from "./query";

export { buildQuery } from "./query";

/** Safety cap on candidates fetched in Complete mode (Worker duration). */
const COMPLETE_OVERFETCH_MULT = 3;
const COMPLETE_CANDIDATE_HARD_CAP = 60;
const ENRICH_CONCURRENCY = 3;

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

function listProviders(): SearchProvider[] {
  const caps = getCapabilities();
  const out: SearchProvider[] = [];
  if (caps.firecrawl) out.push(firecrawlProvider());
  return out;
}

function nicheTags(input: CreateRunInput): string[] {
  const niche = input.niche.trim().toLowerCase();
  const words = niche.split(/\s+/).filter(Boolean).slice(0, 3);
  const tags: string[] = [];
  if (words.length) tags.push(words.join(" "));
  const city = input.location?.trim().split(",")[0]?.trim().toLowerCase();
  if (city && city.length >= 2) tags.push(city);
  return tags.length ? tags : ["lead"];
}

function pageToRawLead(page: PageResult, input: CreateRunInput): RawLead {
  const haystack = `${page.title ?? ""}\n${page.description ?? ""}\n${page.content}`;
  const scrapedLocation = extractLocation(haystack);
  return {
    company: companyFromTitleOrUrl(page.title, page.url),
    website: domainFromUrl(page.url) ? `https://${domainFromUrl(page.url)}` : page.url,
    emails: extractEmails(haystack),
    phones: extractPhones(haystack),
    location: scrapedLocation || null,
    aboutBlurb:
      extractBlurb(page.description || "") ??
      extractBlurb(page.content || "") ??
      null,
    tags: nicheTags(input),
  };
}

function finalize(
  raw: RawLead,
  sourceUrl: string,
  input: CreateRunInput,
  contactName: string | null = null,
): ScoredLead {
  const { score, reasons } = scoreLead(raw, input);
  return {
    ...raw,
    sourceUrl,
    fitScore: score,
    fitReasons: reasons,
    contactName: contactName ?? raw.contactName ?? null,
  };
}

/** Drop leads whose scraped address clearly conflicts with the requested city. */
function passesLocationGate(lead: ScoredLead, input: CreateRunInput): boolean {
  const want = input.location?.trim();
  if (!want) return true;
  const city = want.split(",")[0]?.trim().toLowerCase();
  if (!city) return true;
  const scraped = lead.location?.trim();
  if (!scraped) return true;
  if (scraped.toLowerCase() === want.toLowerCase()) return true;
  if (scraped.toLowerCase().includes(city)) return true;
  return false;
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

function fetchLimit(strategy: SearchStrategy, target: number): number {
  if (strategy === "complete") {
    return Math.min(
      Math.max(target * COMPLETE_OVERFETCH_MULT, target),
      COMPLETE_CANDIDATE_HARD_CAP,
    );
  }
  return target;
}

/**
 * Run search + enrichment.
 *
 * Every company we find is kept (email optional — phone/address/category still
 * matter). Missing email only lowers fit score. Demo only when `input.demo`.
 *
 * - standard: stop at N companies
 * - complete: keep companies without email, stop once N have an email
 */
export async function runSearch(input: CreateRunInput): Promise<SearchOutcome> {
  const target =
    input.maxLeads && input.maxLeads > 0
      ? Math.floor(input.maxLeads)
      : env.maxLeadsPerRun();
  const strategy: SearchStrategy = input.searchStrategy ?? "standard";

  if (input.demo) {
    const demo = demoLeads(input, target).map((raw, i) =>
      finalize(raw, raw.website ?? `https://demo.example.com/${i}`, input),
    );
    return { provider: "demo", mode: "demo", leads: demo };
  }

  const queries = buildQueries(input);
  const providers = listProviders();

  if (providers.length === 0) {
    throw new SearchUnavailableError(
      "No search provider configured. Add FIRECRAWL_API_KEY, or click “Load demo data”.",
    );
  }

  const provider = providers[0]!;
  const wantPages = fetchLimit(strategy, target);
  let pages: PageResult[] = [];
  try {
    pages = await collectPages(provider, queries, wantPages);
  } catch (err) {
    console.error(`[search] ${provider.name} failed:`, err);
    pages = [];
  }

  if (pages.length === 0) {
    return {
      provider: provider.name,
      mode: "live",
      leads: [],
      emptyReason: "Search returned no usable pages. Try a broader niche or different location.",
    };
  }

  // Enrich sequentially in small pools, stopping early for Complete.
  const pageByUrl = new Map(pages.map((p) => [urlKey(p.url), p]));
  const seen = new Set<string>();
  const collected: ScoredLead[] = [];
  let withEmail = 0;

  // Process in chunks so Complete can stop without enriching the whole overfetch.
  for (let i = 0; i < pages.length; i += ENRICH_CONCURRENCY) {
    if (strategy === "standard" && collected.length >= target) break;
    if (strategy === "complete" && withEmail >= target) break;

    const chunk = pages.slice(i, i + ENRICH_CONCURRENCY);
    await mapPool(chunk, ENRICH_CONCURRENCY, async (page) => {
      await enrichFirecrawlPage(page);
      return page;
    });

    for (const page of chunk) {
      if (strategy === "standard" && collected.length >= target) break;
      if (strategy === "complete" && withEmail >= target) break;

      const raw = pageToRawLead(page, input);
      const haystack = `${page.title ?? ""}\n${page.description ?? ""}\n${page.content}`;
      const lead = finalize(raw, page.url, input, extractContactName(haystack));
      const key = domainFromUrl(lead.website) ?? lead.company;
      if (seen.has(key)) continue;
      if (!passesLocationGate(lead, input)) continue;
      seen.add(key);
      collected.push(lead);
      if (lead.emails.length > 0) withEmail++;
    }
  }

  if (collected.length === 0) {
    return {
      provider: provider.name,
      mode: "live",
      leads: [],
      emptyReason: "Search returned no usable pages. Try a broader niche or different location.",
    };
  }

  const useAi = await aiAvailable();
  const pitch = input.offerNotes?.trim() || "";
  const { blurbLooksLikeJunk } = await import("@/lib/outreach/draft");

  const leads: ScoredLead[] = await mapPool(collected, 3, async (lead) => {
    let aboutBlurb = lead.aboutBlurb;
    if (aboutBlurb && blurbLooksLikeJunk(aboutBlurb)) aboutBlurb = null;
    if (useAi) {
      const page = pageByUrl.get(urlKey(lead.sourceUrl));
      const rawText = `${page?.description ?? ""}\n${page?.content ?? ""}\n${lead.aboutBlurb ?? ""}`;
      const polished = await generateLeadBlurb({
        company: lead.company,
        website: lead.website,
        location: lead.location,
        rawText,
      });
      if (polished && !blurbLooksLikeJunk(polished)) aboutBlurb = polished;
    }

    const raw: RawLead = {
      company: lead.company,
      website: lead.website,
      emails: lead.emails,
      phones: lead.phones,
      aboutBlurb,
      location: lead.location,
      tags: lead.tags,
      contactName: lead.contactName,
    };
    let { score, reasons } = scoreLead(raw, input);
    if (useAi && pitch) {
      const pitchFit = await scoreLeadPitchFit({
        pitch,
        company: lead.company,
        aboutBlurb,
        location: lead.location,
        website: lead.website,
      });
      if (pitchFit) {
        score = Math.min(100, score + pitchFit.boost);
        reasons = [...reasons, pitchFit.reason];
      }
    }
    return {
      ...lead,
      aboutBlurb,
      fitScore: score,
      fitReasons: reasons,
    };
  });

  return { provider: provider.name, mode: "live", leads };
}

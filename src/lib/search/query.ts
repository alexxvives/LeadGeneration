import type { CreateRunInput, SearchStrategy } from "@/lib/types";

/**
 * Turn an ICP + optional location into one or more web-search queries.
 *
 * - `standard`: a single naive query (fast, one provider call).
 * - `smart`: several complementary phrasings (contact page, official site,
 *   "best/top") merged for higher recall — the general-purpose default upgrade.
 * - `local`: phrasings tuned for brick-and-mortar / near-me businesses
 *   (directory-style, reviews, "in <city>").
 *
 * Callers run each query and merge/dedupe the results, so ordering here only
 * affects which variant is tried first. We dedupe the strings defensively
 * because empty locations collapse some variants together.
 */
export function buildQueries(input: CreateRunInput, strategy: SearchStrategy = "standard"): string[] {
  const niche = input.niche.trim();
  const loc = input.location?.trim() ?? "";
  const where = loc ? ` ${loc}` : "";

  const variants: Record<SearchStrategy, string[]> = {
    standard: [`${niche}${where} contact email`],
    smart: [
      `${niche}${where} contact email`,
      `${niche}${where} official website`,
      loc ? `top ${niche} in ${loc}` : `best ${niche} companies`,
    ],
    local: [
      loc ? `${niche} in ${loc}` : `${niche} near me`,
      `${niche}${where} phone email address`,
      `${niche}${where} reviews contact`,
    ],
  };

  const queries = variants[strategy] ?? variants.standard;
  return dedupe(queries.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean));
}

/** Back-compat single-query helper (standard strategy). */
export function buildQuery(input: CreateRunInput): string {
  return buildQueries(input, "standard")[0] ?? input.niche.trim();
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

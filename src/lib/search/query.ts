import type { CreateRunInput } from "@/lib/types";

/**
 * Turn an ICP + optional location into a web-search query that finds
 * **businesses** (not contact-form pages). Contact info is extracted later
 * by scraping contact paths, then the landing header/footer.
 */
export function buildQuery(input: CreateRunInput): string {
  const niche = input.niche.trim();
  const loc = input.location?.trim() ?? "";
  const q = loc ? `${niche} in ${loc}` : niche;
  return q.replace(/\s+/g, " ").trim();
}

/** @deprecated Use buildQuery — kept for call sites that expected an array. */
export function buildQueries(input: CreateRunInput): string[] {
  const q = buildQuery(input);
  return q ? [q] : [];
}

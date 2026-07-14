import type { CreateRunInput } from "@/lib/types";

export interface RawLead {
  company: string;
  website: string | null;
  emails: string[];
  phones: string[];
  aboutBlurb: string | null;
  location: string | null;
  tags: string[];
}

/**
 * Transparent, heuristic fit score (0-100). No black-box model — every point
 * is explained in `reasons` so a human can sanity-check before reaching out.
 */
export function scoreLead(
  lead: RawLead,
  input: CreateRunInput,
): { score: number; reasons: string[] } {
  let score = 40; // baseline: it showed up in a relevant search
  const reasons: string[] = ["Matched your search query"];

  if (lead.emails.length > 0) {
    score += 22;
    reasons.push("Direct email contact found");
  } else {
    reasons.push("No email yet — needs manual lookup");
  }

  if (lead.phones.length > 0) {
    score += 8;
    reasons.push("Phone number available");
  }

  if (lead.website) {
    score += 10;
    reasons.push("Has a live website");
  }

  if (lead.aboutBlurb && lead.aboutBlurb.length > 40) {
    score += 8;
    reasons.push("Rich profile to personalize on");
  }

  // Location alignment bonus.
  const wantLoc = input.location?.toLowerCase().trim();
  if (wantLoc && lead.location?.toLowerCase().includes(wantLoc.split(",")[0])) {
    score += 12;
    reasons.push(`In target location (${input.location})`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

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

  // Location alignment.
  const wantLoc = input.location?.toLowerCase().trim();
  if (wantLoc) {
    const city = wantLoc.split(",")[0]?.trim() ?? wantLoc;
    const leadLoc = lead.location?.toLowerCase() ?? "";
    const hay = `${leadLoc} ${lead.website ?? ""} ${lead.company}`.toLowerCase();
    if (city && leadLoc.includes(city)) {
      score += 12;
      reasons.push(`In target location (${input.location})`);
    } else if (city && leadLoc && !leadLoc.includes(city)) {
      // Scraped address is elsewhere — heavy penalty (filtered later if severe).
      score -= 28;
      reasons.push(`Location mismatch — page says ${lead.location}, not ${input.location}`);
    } else if (city && /\b(ny|nyc|new york|usa|united states)\b/i.test(hay) && /spain|españa|catalonia|catalunya/i.test(wantLoc)) {
      score -= 30;
      reasons.push("Looks US-based while you asked for Spain");
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

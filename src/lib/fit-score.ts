import type { CreateRunInput } from "@/lib/types";

export interface RawLead {
  company: string;
  website: string | null;
  emails: string[];
  phones: string[];
  aboutBlurb: string | null;
  location: string | null;
  tags: string[];
  contactName?: string | null;
}

/**
 * Transparent fit score (0–100). Starts at 0 — no free points for “showed up
 * in search”. Scores how ready this lead is to contact + how well it matches
 * the niche/location you asked for. Every point is explained in `reasons`.
 *
 * Rough budget:
 *   Contactability …… up to ~55
 *   ICP / relevance …… up to ~45
 *   Mismatch penalties …… down to 0
 */
export function scoreLead(
  lead: RawLead,
  input: Pick<CreateRunInput, "niche" | "location">,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // ── Contactability ────────────────────────────────────────────────────────
  if (lead.emails.length > 0) {
    score += 28;
    reasons.push("Direct email on file");
    if (lead.emails.length > 1) {
      score += 4;
      reasons.push("Multiple emails");
    }
  } else {
    reasons.push("No email — needs lookup before send");
  }

  if (lead.phones.length > 0) {
    score += 10;
    reasons.push("Phone number available");
  }

  if (lead.website) {
    score += 10;
    reasons.push("Has a website");
  }

  if (lead.contactName?.trim()) {
    score += 5;
    reasons.push("Named contact");
  }

  const blurb = lead.aboutBlurb?.trim() ?? "";
  if (blurb.length > 60) {
    score += 8;
    reasons.push("Rich blurb to personalize on");
  } else if (blurb.length > 20) {
    score += 4;
    reasons.push("Short blurb available");
  }

  // ── Niche relevance (no free “search match” baseline) ─────────────────────
  const niche = input.niche?.toLowerCase().trim() ?? "";
  if (niche) {
    const tokens = nicheTokens(niche);
    const hay = `${lead.company} ${blurb} ${lead.tags.join(" ")}`.toLowerCase();
    const hits = tokens.filter((t) => hay.includes(t));
    if (hits.length >= 2) {
      score += 18;
      reasons.push(`Strong niche match (${hits.slice(0, 3).join(", ")})`);
    } else if (hits.length === 1) {
      score += 10;
      reasons.push(`Mentions your niche (“${hits[0]}”)`);
    } else if (tokens.length > 0) {
      // Still a search hit, but no textual niche signal — small credit only.
      score += 4;
      reasons.push("Search result — niche not obvious in profile");
    }
  }

  // ── Location ──────────────────────────────────────────────────────────────
  const wantLoc = input.location?.toLowerCase().trim();
  if (wantLoc) {
    const city = wantLoc.split(",")[0]?.trim() ?? wantLoc;
    const leadLoc = lead.location?.toLowerCase() ?? "";
    const hay = `${leadLoc} ${lead.website ?? ""} ${lead.company}`.toLowerCase();
    if (city && leadLoc.includes(city)) {
      score += 18;
      reasons.push(`In target location (${input.location})`);
    } else if (city && leadLoc && !leadLoc.includes(city)) {
      score -= 22;
      reasons.push(
        `Location mismatch — page says ${lead.location}, not ${input.location}`,
      );
    } else if (
      city &&
      /\b(ny|nyc|new york|usa|united states)\b/i.test(hay) &&
      /spain|españa|catalonia|catalunya/i.test(wantLoc)
    ) {
      score -= 25;
      reasons.push("Looks US-based while you asked for Spain");
    } else if (city && !leadLoc) {
      reasons.push("Location unknown — couldn’t confirm target area");
    }
  }

  if (reasons.length === 0) {
    reasons.push("Limited contact data so far");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/** Score an imported row with the same rubric (no niche search context). */
export function scoreImportedLead(lead: RawLead): {
  score: number;
  reasons: string[];
} {
  const { score, reasons } = scoreLead(lead, { niche: "", location: lead.location });
  return {
    score,
    reasons: ["Imported from your file", ...reasons.filter((r) => !r.startsWith("No email"))],
  };
}

function nicheTokens(niche: string): string[] {
  const stop = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "in",
    "for",
    "to",
    "with",
    "near",
    "best",
    "top",
  ]);
  return niche
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3 && !stop.has(t));
}

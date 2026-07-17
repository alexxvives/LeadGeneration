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
 * Fit score (0–100): how good a prospect this is for the search ICP.
 *
 * Relevance (niche + location) is the spine — a random email with no niche
 * signal stays low. Contactability is a multiplier-style boost only after
 * there is some relevance, so “showed up in search” alone never scores well.
 *
 * Rough budget when niche is provided:
 *   Niche relevance …… up to 50
 *   Location …………… up to 25 (or heavy mismatch penalty)
 *   Contactability …… up to 25 (scaled by relevance)
 */
export function scoreLead(
  lead: RawLead,
  input: Pick<CreateRunInput, "niche" | "location">,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const blurb = lead.aboutBlurb?.trim() ?? "";
  const hay = [
    lead.company,
    blurb,
    lead.tags.join(" "),
    lead.website ?? "",
    lead.location ?? "",
  ]
    .join(" ")
    .toLowerCase();

  // ── Niche relevance (0–50) ────────────────────────────────────────────────
  let nicheScore = 0;
  const niche = input.niche?.toLowerCase().trim() ?? "";
  const tokens = niche ? nicheTokens(niche) : [];
  if (tokens.length > 0) {
    const hits = tokens.filter((t) => hay.includes(t));
    const ratio = hits.length / tokens.length;
    if (hits.length === 0) {
      reasons.push("No clear niche match in name, blurb, or tags");
    } else if (ratio >= 0.6 || hits.length >= 3) {
      nicheScore = 50;
      reasons.push(`Strong niche match (${hits.slice(0, 3).join(", ")})`);
    } else if (hits.length >= 2 || ratio >= 0.35) {
      nicheScore = 32;
      reasons.push(`Partial niche match (${hits.slice(0, 2).join(", ")})`);
    } else {
      nicheScore = 16;
      reasons.push(`Weak niche signal (“${hits[0]}”)`);
    }
  }

  // ── Location (0–25, or penalty) ───────────────────────────────────────────
  let locationScore = 0;
  const wantLoc = input.location?.toLowerCase().trim();
  if (wantLoc) {
    const city = wantLoc.split(",")[0]?.trim() ?? wantLoc;
    const leadLoc = lead.location?.toLowerCase() ?? "";
    if (city && leadLoc.includes(city)) {
      locationScore = 25;
      reasons.push("In target location");
    } else if (city && leadLoc && !leadLoc.includes(city)) {
      locationScore = -30;
      reasons.push(
        `Location mismatch — page says ${lead.location}, not ${input.location}`,
      );
    } else if (
      city &&
      /\b(ny|nyc|new york|usa|united states)\b/i.test(hay) &&
      /spain|españa|catalonia|catalunya/i.test(wantLoc)
    ) {
      locationScore = -35;
      reasons.push("Looks US-based while you asked for Spain");
    } else if (city && !leadLoc) {
      reasons.push("Location unknown — couldn’t confirm target area");
    }
  }

  // ── Contactability raw (0–25), then scale by relevance ────────────────────
  let contactRaw = 0;
  if (lead.emails.length > 0) {
    contactRaw += 14;
    reasons.push("Direct email on file");
    if (lead.emails.length > 1) {
      contactRaw += 3;
      reasons.push("Multiple emails");
    }
  } else {
    reasons.push("No email — needs lookup before send");
  }
  if (lead.phones.length > 0) {
    contactRaw += 4;
    reasons.push("Phone number available");
  }
  if (lead.website) {
    contactRaw += 2;
    reasons.push("Has a website");
  }
  if (lead.contactName?.trim()) {
    contactRaw += 2;
    reasons.push("Named contact");
  }
  if (blurb.length > 60) {
    contactRaw += 3;
    reasons.push("Rich blurb to personalize on");
  } else if (blurb.length > 20) {
    contactRaw += 1;
    reasons.push("Short blurb available");
  }
  contactRaw = Math.min(25, contactRaw);

  // Without niche context (imports), treat contactability as the main signal.
  // With niche, only award contact points once there is some relevance —
  // otherwise a wrong-ICP email farm would score high.
  const hasNicheContext = tokens.length > 0;
  const relevance = Math.max(0, nicheScore + Math.max(0, locationScore));
  let contactScore: number;
  if (!hasNicheContext) {
    contactScore = contactRaw;
  } else if (relevance <= 0) {
    contactScore = Math.round(contactRaw * 0.15);
  } else if (nicheScore < 16) {
    contactScore = Math.round(contactRaw * 0.45);
  } else {
    contactScore = contactRaw;
  }

  const score = nicheScore + locationScore + contactScore;

  if (reasons.length === 0) {
    reasons.push("Limited contact data so far");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

/**
 * Score an imported row. Optional `offerNotes` (active profile pitch) is used as
 * soft niche context so imports aren't scored as empty ICP.
 */
export function scoreImportedLead(
  lead: RawLead,
  offerNotes?: string | null,
): {
  score: number;
  reasons: string[];
} {
  const nicheFromPitch = (offerNotes ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const { score, reasons } = scoreLead(lead, {
    niche: nicheFromPitch,
    location: lead.location,
  });
  return {
    score,
    reasons: reasons.filter((r) => !r.startsWith("No email")),
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
    "find",
    "looking",
    "companies",
    "company",
    "business",
    "businesses",
  ]);
  return niche
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3 && !stop.has(t));
}

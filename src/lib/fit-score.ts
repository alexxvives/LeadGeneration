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
  companyType?: string | null;
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
  // Company / blurb / location / type only. Never the website URL or tags —
  // tags often echo the search query, and URLs substring-match junk tokens
  // (e.g. German “wir” inside “awirutmasajebarcelona.com”).
  const hayText = [
    lead.company,
    blurb,
    lead.location ?? "",
    lead.companyType ?? "",
  ].join(" ");
  const hayTokens = new Set(nicheTokens(hayText));

  // ── Niche relevance (0–50) ────────────────────────────────────────────────
  let nicheScore = 0;
  const niche = input.niche?.toLowerCase().trim() ?? "";
  const tokens = niche ? nicheTokens(niche) : [];
  if (tokens.length > 0) {
    const hits = uniqueHits(tokens, hayTokens);
    const ratio = hits.length / tokens.length;
    if (hits.length === 0) {
      reasons.push("No clear niche match in name, blurb, or category");
    } else if (hits.length >= 3 || ratio >= 0.5) {
      nicheScore = 50;
      reasons.push(`Strong niche match (${hits.slice(0, 3).join(", ")})`);
    } else if (hits.length >= 2 || (hits.length === 1 && hits[0]!.length >= 5)) {
      nicheScore = 32;
      reasons.push(
        hits.length >= 2
          ? `Partial niche match (${hits.slice(0, 2).join(", ")})`
          : `Niche match (“${hits[0]}”)`,
      );
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
      /\b(ny|nyc|new york|usa|united states)\b/i.test(hayText) &&
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
  const nicheFromPitch = pitchToNicheContext(offerNotes);
  const { score, reasons } = scoreLead(lead, {
    niche: nicheFromPitch,
    location: lead.location,
  });
  return {
    score,
    reasons: reasons.filter((r) => !r.startsWith("No email")),
  };
}

/** Distinctive words from a sales pitch — not the whole email as a fake ICP. */
function pitchToNicheContext(offerNotes?: string | null): string {
  const plain = (offerNotes ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]+\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  return [...new Set(nicheTokens(plain))].slice(0, 24).join(" ");
}

function uniqueHits(tokens: string[], hayTokens: Set<string>): string[] {
  const seen = new Set<string>();
  const hits: string[] = [];
  for (const t of tokens) {
    if (seen.has(t) || !hayTokens.has(t)) continue;
    seen.add(t);
    hits.push(t);
  }
  return hits;
}

/** 3-letter ICPs we still want to match (spa, gym, …). */
const SHORT_NICHE = new Set([
  "spa",
  "gym",
  "seo",
  "b2b",
  "app",
  "law",
  "vet",
  "bar",
  "pub",
  "prp",
  "med",
]);

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
    "that",
    "this",
    "from",
    "have",
    "been",
    "they",
    "them",
    "their",
    "your",
    "our",
    "are",
    "was",
    "were",
    "will",
    "would",
    "could",
    "should",
    "about",
    "into",
    "over",
    "more",
    "only",
    "than",
    "then",
    "some",
    "just",
    "very",
    "also",
    "what",
    "when",
    "which",
    "while",
    "these",
    "those",
    "imported",
    "demo-data",
    // Romance / Germanic articles and filler that leak into niche / pitch
    "el",
    "la",
    "los",
    "las",
    "del",
    "una",
    "uno",
    "unos",
    "unas",
    "por",
    "para",
    "con",
    "que",
    "como",
    "este",
    "esta",
    "esto",
    "desde",
    "somos",
    "hemos",
    "tiene",
    "entre",
    "sobre",
    "pero",
    "muy",
    "sus",
    "les",
    "nos",
    "wir",
    "uns",
    "ihr",
    "sie",
    "eine",
    "einer",
    "einen",
    "nicht",
    "sich",
    "dass",
    "oder",
    "auch",
    "nach",
    "kein",
    "sind",
    "wird",
    "der",
    "die",
    "das",
    "und",
    "den",
    "dem",
    "les",
    "des",
    "une",
    "aux",
    "dei",
    "delle",
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of niche.split(/[^a-z0-9à-ÿ]+/i)) {
    const t = raw.trim().toLowerCase();
    if (!t || seen.has(t) || stop.has(t)) continue;
    if (t.length < 4 && !SHORT_NICHE.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

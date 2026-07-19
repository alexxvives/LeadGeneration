/**
 * Demo-safe company-type helpers: Excel mapping + keyword suggestion from text.
 * Not a Firecrawl extract — scrapers can pass blurb/page text here later.
 */

const KEYWORD_TYPES: Array<{ type: string; patterns: RegExp[] }> = [
  {
    type: "Pharmacy",
    patterns: [/\bpharmac(y|ies)\b/i, /\bapothecary\b/i, /\bchemist\b/i],
  },
  {
    type: "Dermatology Clinic",
    patterns: [/\bdermatolog/i, /\bskin clinic\b/i],
  },
  {
    type: "Aesthetic Clinic",
    patterns: [
      /\baesthetic/i,
      /\bmed\s*spa\b/i,
      /\bmedical spa\b/i,
      /\bbotox\b/i,
      /\bfiller\b/i,
    ],
  },
  {
    type: "Hair Clinic",
    patterns: [/\bhair (clinic|transplant|restoration)\b/i, /\btricholog/i],
  },
  {
    type: "Hair Salon",
    patterns: [/\bhair salon\b/i, /\bbarber\b/i, /\bcoiffeur\b/i],
  },
  {
    type: "SPA",
    patterns: [/\bspa\b/i, /\bwellness center\b/i, /\bday spa\b/i],
  },
  {
    type: "Dental Clinic",
    patterns: [/\bdentist\b/i, /\bdental\b/i, /\borthodont/i],
  },
];

/** Suggest a company type from free text (company name, blurb, tags). */
export function suggestCompanyType(
  ...parts: Array<string | null | undefined>
): string | null {
  const hay = parts.filter(Boolean).join(" \n ");
  if (!hay.trim()) return null;
  for (const { type, patterns } of KEYWORD_TYPES) {
    if (patterns.some((re) => re.test(hay))) return type;
  }
  return null;
}

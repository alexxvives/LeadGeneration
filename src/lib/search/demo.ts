import type { CreateRunInput } from "@/lib/types";
import type { RawLead } from "@/lib/fit-score";

// Deterministic-ish demo lead generator. Produces believable, clearly-fake
// sample companies tailored to the niche/location so the UI is fully usable
// with no API keys. All emails use reserved example domains and are NOT real.

const FIRST_NAMES = [
  "Maya",
  "Jordan",
  "Priya",
  "Diego",
  "Sofia",
  "Wesley",
  "Amara",
  "Liam",
  "Noor",
  "Elena",
  "Marcus",
  "Ivy",
];

const SUFFIXES = ["Co", "Group", "Studio", "Partners", "Collective", "Labs", "House", "Works"];

const BLURB_TEMPLATES = [
  "A local {niche} focused on friendly, on-time service and repeat customers.",
  "Family-run {niche} that has served the {loc} community for over a decade.",
  "Boutique {niche} known for premium experience and strong online reviews.",
  "Fast-growing {niche} expanding to new neighborhoods across {loc}.",
  "Independent {niche} looking to modernize how they win new clients.",
];

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

/** Generate `count` demo leads shaped by the search input. */
export function demoLeads(input: CreateRunInput, count: number): RawLead[] {
  const nicheWord = input.niche.trim() || "business";
  const loc = input.location?.trim() || "your area";
  const nounSeed = nicheWord.split(/\s+/).slice(0, 2).join(" ");

  const leads: RawLead[] = [];
  for (let i = 0; i < count; i++) {
    const suffix = pick(SUFFIXES, i);
    const flourish = pick(
      ["Bright", "North", "Ember", "Cedar", "Harbor", "Summit", "Vista", "Oak", "Lark", "Union"],
      i * 3 + 1,
    );
    const company = `${flourish} ${capitalizeWords(nounSeed)} ${suffix}`;
    const domain = `${slug(flourish + "-" + nounSeed)}.example.com`;
    const first = pick(FIRST_NAMES, i);
    const hasEmail = i % 4 !== 3; // ~75% have discoverable emails
    const hasPhone = i % 3 !== 2;

    leads.push({
      company,
      website: `https://${domain}`,
      emails: hasEmail ? [`${first.toLowerCase()}@${domain}`] : [],
      phones: hasPhone ? [`(${512 + (i % 3)}) 555-01${(10 + i).toString().slice(-2)}`] : [],
      location: input.location?.trim() || null,
      aboutBlurb: pick(BLURB_TEMPLATES, i)
        .replace("{niche}", nicheWord)
        .replace("{loc}", loc),
      tags: [nounSeed.toLowerCase(), "demo-data"],
    });
  }
  return leads;
}

function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

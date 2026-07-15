/**
 * LLM helpers for blurbs + default pitch. Always optional — null/empty means
 * "use heuristic/template instead".
 */

import { workersAiChat } from "@/lib/ai/workers-ai";
import {
  langLabel,
  outreachLangFromLocation,
  type OutreachLang,
} from "@/lib/outreach/locale";

function cleanOneLine(text: string, max = 220): string {
  const flat = text
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^here(?:'s| is)\s+/i, "")
    .trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Rewrite scraped page crumbs into a short company description for the lead card
 * and outreach opener. Language follows lead location.
 */
export async function generateLeadBlurb(opts: {
  company: string;
  website: string | null;
  location: string | null;
  rawText: string;
}): Promise<string | null> {
  const raw = opts.rawText.replace(/\s+/g, " ").trim().slice(0, 2500);
  if (raw.length < 40) return null;

  const lang = outreachLangFromLocation(opts.location);
  const out = await workersAiChat(
    `You write one factual sentence describing a company for B2B outreach. Language: ${langLabel(lang)}. Plain and specific. No marketing fluff, no greetings, no quotes, no nav/menu words. Max 35 words.`,
    [
      `Company: ${opts.company}`,
      opts.website ? `Website: ${opts.website}` : null,
      opts.location ? `Location: ${opts.location}` : null,
      `Source text:`,
      raw,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return out ? cleanOneLine(out, 240) : null;
}

/**
 * Default offer / pitch from the user's own company website (Settings).
 */
export async function generateDefaultPitch(opts: {
  companyName?: string;
  website: string;
  pageText: string;
  /** Pitch language — usually the user's market; default English. */
  lang?: OutreachLang;
}): Promise<string | null> {
  const raw = opts.pageText.replace(/\s+/g, " ").trim().slice(0, 3500);
  if (raw.length < 40) return null;

  const lang = opts.lang ?? "en";
  const out = await workersAiChat(
    `You write a short cold-email pitch (2–3 sentences) in ${langLabel(lang)}. Sound like a real person, not a marketer. First person. Concrete value only. No hype words (revolutionize, seamless, leverage). No subject line, greeting, or sign-off.`,
    [
      opts.companyName ? `Our company: ${opts.companyName}` : null,
      `Our website: ${opts.website}`,
      `Website content:`,
      raw,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (!out) return null;
  return out
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

/** Map over items with a concurrency cap (keeps Workers AI from stampeding). */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

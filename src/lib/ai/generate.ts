/**
 * LLM helpers for blurbs + default pitch.
 * Always optional — null means "no AI available / failed" (no fake copy).
 */

import { aiChat } from "@/lib/ai/chat";
import {
  langLabel,
  outreachLangFromLocation,
  outreachLangFromText,
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
  const out = await aiChat(
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
  return out ? cleanOneLine(out.text, 240) : null;
}

const PITCH_SYSTEM = (lang: OutreachLang) =>
  [
    `You write the "offer / pitch" paragraph for a cold B2B email, in ${langLabel(lang)} only.`,
    `Voice: first person plural ("we" / local equivalent). Sound like a real founder, not a marketer.`,
    `Content: 2–3 short sentences that say (1) who we help, (2) the concrete problem we solve, (3) the outcome — grounded ONLY in the website content.`,
    `Hard rules:`,
    `- Stay 100% in ${langLabel(lang)}. Never mix languages or leave brand slogans in another language.`,
    `- Do NOT paste or lightly rewrite homepage taglines, slogans, or "about us" marketing copy.`,
    `- Do NOT invent features, customers, or claims that are not supported by the source.`,
    `- No subject line, greeting, sign-off, quotes, or hype words (revolutionize, seamless, leverage, cerebro tecnológico, etc.).`,
    `- Output the pitch paragraph only — nothing else.`,
  ].join(" ");

/**
 * Default offer / pitch from the user's own company website (Settings).
 */
export async function generateDefaultPitch(opts: {
  companyName?: string;
  website: string;
  pageText: string;
  /** Pitch language — usually the user's market; else inferred from page text. */
  lang?: OutreachLang;
}): Promise<string | null> {
  const raw = opts.pageText.replace(/\s+/g, " ").trim().slice(0, 3500);
  if (raw.length < 40) return null;

  const lang = opts.lang ?? outreachLangFromText(raw);
  const out = await aiChat(
    PITCH_SYSTEM(lang),
    [
      opts.companyName ? `Our company: ${opts.companyName}` : null,
      `Our website: ${opts.website}`,
      `Website content (facts only — rewrite into a cold-email pitch, do not quote slogans):`,
      raw,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (!out) return null;
  return out.text
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

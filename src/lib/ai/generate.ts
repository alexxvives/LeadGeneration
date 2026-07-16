/**
 * LLM helpers for blurbs + default pitch.
 * Always optional — null means "no AI available / failed" (no fake copy).
 */

import { aiChat, type AiProvider } from "@/lib/ai/chat";
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
}): Promise<{ pitch: string; provider: AiProvider } | null> {
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
  const pitch = out.text
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
  if (!pitch) return null;
  return { pitch, provider: out.provider };
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

/**
 * Translate subject + body (or pitch HTML/plain) into a target outreach language.
 * Returns null when no AI provider is available.
 */
export async function translateOutreachCopy(opts: {
  text: string;
  targetLang: OutreachLang;
  /** Optional hint — subject line vs body/pitch. */
  kind?: "subject" | "body";
}): Promise<{ text: string; provider: AiProvider } | null> {
  const src = opts.text.replace(/\r\n/g, "\n").trim();
  if (!src) return null;
  const kind = opts.kind ?? "body";
  const out = await aiChat(
    [
      `You translate B2B cold-email ${kind === "subject" ? "subject lines" : "copy"} into ${langLabel(opts.targetLang)} only.`,
      `Preserve meaning, tone, and placeholders exactly as written (e.g. {company}, {lead_name}, {location}).`,
      `Keep light HTML tags if present (b, strong, ul, ol, li, p, br). Do not add a greeting or sign-off.`,
      `Output the translation only — no quotes, no preamble.`,
    ].join(" "),
    src.slice(0, kind === "subject" ? 400 : 3500),
  );
  if (!out) return null;
  const text = out.text
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim()
    .slice(0, kind === "subject" ? 300 : 4000);
  if (!text) return null;
  return { text, provider: out.provider };
}

/**
 * Rewrite a template draft into a slightly different version for one lead.
 * Falls back to null when AI is unavailable (caller keeps the template).
 */
export async function personalizeDraftForLead(opts: {
  company: string;
  contactName: string | null;
  location: string | null;
  aboutBlurb: string | null;
  website: string | null;
  lang: OutreachLang;
  subject: string;
  body: string;
}): Promise<{ subject: string; body: string; provider: AiProvider } | null> {
  const out = await aiChat(
    [
      `You personalize one cold B2B email in ${langLabel(opts.lang)} only.`,
      `Keep the same offer and intent as the template. Vary wording slightly so each send feels unique — do not invent claims.`,
      `Keep placeholders already resolved (real company/name). Keep a natural greeting and sign-off if present.`,
      `Keep light HTML tags if present (b, strong, i, em, u, ul, ol, li, p, br).`,
      `Return JSON only: {"subject":"...","body":"..."} (use HTML or \\n for newlines).`,
    ].join(" "),
    [
      `Company: ${opts.company}`,
      opts.contactName ? `Contact: ${opts.contactName}` : null,
      opts.location ? `Location: ${opts.location}` : null,
      opts.website ? `Website: ${opts.website}` : null,
      opts.aboutBlurb ? `About: ${opts.aboutBlurb}` : null,
      `Template subject: ${opts.subject}`,
      `Template body:`,
      opts.body.slice(0, 3000),
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (!out) return null;
  try {
    const match = out.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { subject?: string; body?: string };
    const subject = String(parsed.subject ?? "").trim().slice(0, 300);
    const body = String(parsed.body ?? "")
      .replace(/\\n/g, "\n")
      .trim()
      .slice(0, 6000);
    if (!subject || !body) return null;
    return { subject, body, provider: out.provider };
  } catch {
    return null;
  }
}

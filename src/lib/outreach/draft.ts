import { env } from "@/lib/config";
import type { Lead, Run } from "@/lib/types";

// Deterministic, no-API-key outreach drafting. Produces a personalized first
// email using the lead's enriched profile + the run's offer notes. This is
// intentionally template-based so the MVP needs no LLM key; swap in an LLM here
// later without touching the approval/send flow.

export interface DraftResult {
  subject: string;
  body: string;
}

function firstName(lead: Lead): string {
  if (lead.contactName) return lead.contactName.split(/\s+/)[0];
  return "there";
}

function shortCompany(lead: Lead): string {
  return lead.company.replace(/\b(LLC|Inc|Co|Group|Studio|Partners|Collective|Labs)\b\.?/gi, "").trim() ||
    lead.company;
}

/** Build the compliance footer required for cold email (CAN-SPAM style). */
export function complianceFooter(): string {
  // NOTE: The unsubscribe link is a PLACEHOLDER. Wire it to a real opt-out
  // handler before sending to anyone. Including a clear from-identity and a
  // physical mailing address is required by CAN-SPAM (US) and good practice
  // everywhere. Review local laws (GDPR/CASL/etc.) before commercial sending.
  const from = `${env.fromName()} <${env.fromEmail()}>`;
  return [
    "",
    "—",
    `Sent by ${from}`,
    `${env.physicalAddress()}`,
    "Don't want to hear from us? Reply STOP or unsubscribe: {{unsubscribe_url}}",
  ].join("\n");
}

export function generateDraft(lead: Lead, run: Run): DraftResult {
  const name = firstName(lead);
  const company = shortCompany(lead);
  const offer = run.offerNotes?.trim();
  const nicheHint = run.niche.trim();

  const subject = offer
    ? `Quick idea for ${company}`
    : `Helping ${nicheHint || company} win more customers`;

  const personalLine = lead.aboutBlurb
    ? `I came across ${company} — "${truncate(lead.aboutBlurb, 120)}" — and thought I'd reach out.`
    : `I came across ${company} and thought I'd reach out.`;

  const pitchLine = offer
    ? offer
    : `I help ${nicheHint || "businesses like yours"} turn their website traffic into booked calls, without adding to your workload.`;

  const body = [
    `Hi ${name},`,
    "",
    personalLine,
    "",
    pitchLine,
    "",
    "Would it be worth a quick 10-minute call next week to see if it's a fit? If not, no worries at all — just reply and let me know.",
    "",
    `Best,`,
    env.fromName(),
    complianceFooter(),
  ].join("\n");

  return { subject, body };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

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
  if (lead.contactName) return lead.contactName.split(/\s+/)[0]!;
  return "";
}

function shortCompany(lead: Lead): string {
  return (
    lead.company
      .replace(/\b(LLC|Inc|Co|Group|Studio|Partners|Collective|Labs|Academy|Academia)\b\.?/gi, "")
      .trim() || lead.company
  );
}

/** Rough US location check for CAN-SPAM physical-address requirement. */
export function leadLooksLikeUsa(lead: Pick<Lead, "location">): boolean {
  const loc = lead.location?.trim() ?? "";
  if (!loc) return false;
  if (/\b(USA|U\.S\.A\.?|United States|Estados Unidos)\b/i.test(loc)) return true;
  // City, ST pattern with US state codes
  return /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i.test(
    loc,
  );
}

/**
 * Quiet compliance block appended only at send time (not in the editable draft).
 * Physical address only for US recipients (CAN-SPAM).
 */
export function complianceFooter(opts?: {
  physicalAddress?: string | null;
  includeAddress?: boolean;
}): string {
  const lines = ["", "—"];
  if (opts?.includeAddress) {
    const address = (opts.physicalAddress || env.physicalAddress()).trim();
    if (address && !/placeholder|your city|00000/i.test(address)) {
      lines.push(address);
    }
  }
  lines.push("If you’d rather not hear from us, reply STOP.");
  return lines.join("\n");
}

export function generateDraft(lead: Lead, run: Run): DraftResult {
  const name = firstName(lead);
  const company = shortCompany(lead);
  const offer = run.offerNotes?.trim();
  const nicheHint = run.niche.trim();
  // senderName may be a multi-line signature block from the browser profile.
  const signOff = (run.senderName?.trim() || env.fromName()).replace(/\r\n/g, "\n");

  const subject = `Propuesta para ${company}`;
  const greeting = name ? `Hola ${name},` : `Hola,`;

  const blurb = lead.aboutBlurb?.trim() ?? "";
  const blurbLooksLikePolicy =
    /cookie|privacy|identif|gdpr|personalize your experience|terms of/i.test(blurb);

  let opener: string;
  if (blurb && !blurbLooksLikePolicy) {
    opener = `Vi ${company} y me llamó la atención lo que hacen — especialmente: "${truncate(blurb, 90)}".`;
  } else if (lead.website) {
    opener = `Estuve mirando ${company} (${lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}) y me pareció un buen momento para escribirles.`;
  } else {
    opener = `Estuve revisando ${company} y quise contactarlos directamente.`;
  }

  const pitch = offer
    ? offer
    : `Trabajo con ${nicheHint || "equipos como el suyo"} para convertir visitas web en conversaciones reales — sin sumar más carga operativa al día a día.`;

  const body = [
    greeting,
    "",
    opener,
    "",
    pitch,
    "",
    "¿Tendrían 10 minutos la semana que viene para ver si encaja? Si no es el momento, no hay problema — con un “no” me alcanza.",
    "",
    signOff,
  ].join("\n");

  return { subject, body };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

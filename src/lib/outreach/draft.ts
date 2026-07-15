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
    lead.company.replace(/\b(LLC|Inc|Co|Group|Studio|Partners|Collective|Labs|Academy|Academia)\b\.?/gi, "").trim() ||
    lead.company
  );
}

/**
 * Quiet compliance block appended only at send time (not in the editable draft).
 * Keeps CAN-SPAM essentials without the scammy "Sent by… Reply STOP" chrome.
 */
export function complianceFooter(opts?: {
  physicalAddress?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
}): string {
  const address = (opts?.physicalAddress || env.physicalAddress()).trim();
  const lines = ["", "—"];
  if (address && !/placeholder|your city|00000/i.test(address)) {
    lines.push(address);
  }
  lines.push("Si prefieres no recibir más mensajes, responde STOP.");
  return lines.join("\n");
}

export function generateDraft(lead: Lead, run: Run): DraftResult {
  const name = firstName(lead);
  const company = shortCompany(lead);
  const offer = run.offerNotes?.trim();
  const nicheHint = run.niche.trim();
  const signOff = run.senderName?.trim() || env.fromName();

  const subject = `Propuesta para ${company}`;

  const greeting = name ? `Hola ${name},` : `Hola,`;

  // Prefer a concrete hook over quoting privacy-policy blurbs (common scrape noise).
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
    "Un saludo,",
    signOff,
  ].join("\n");

  return { subject, body };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

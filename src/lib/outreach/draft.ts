import { env } from "@/lib/config";
import {
  outreachLangFromLocation,
  type OutreachLang,
} from "@/lib/outreach/locale";
import type { Lead, Run } from "@/lib/types";

// Deterministic, no-API-key outreach drafting. Language follows lead geography
// (see locale.ts). LLM is optional for blurbs/pitch only — drafts stay template
// so zero-key demo mode always works (constitution Art. I.2).

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

type Copy = {
  subject: (company: string) => string;
  greeting: (name: string) => string;
  openerBlurb: (company: string, blurb: string) => string;
  openerSite: (company: string, host: string) => string;
  openerPlain: (company: string) => string;
  defaultPitch: (niche: string) => string;
  cta: string;
};

const COPY: Record<OutreachLang, Copy> = {
  en: {
    subject: (c) => `Idea for ${c}`,
    greeting: (n) => (n ? `Hi ${n},` : `Hi,`),
    openerBlurb: (c, b) =>
      `I came across ${c} and liked what you're doing — especially: "${b}".`,
    openerSite: (c, h) =>
      `I was looking at ${c} (${h}) and thought it was a good time to reach out.`,
    openerPlain: (c) => `I've been looking at ${c} and wanted to get in touch directly.`,
    defaultPitch: (niche) =>
      `I work with ${niche || "teams like yours"} to turn website visits into real conversations — without adding more day-to-day ops load.`,
    cta: `Would you have 10 minutes next week to see if it's a fit? If not the right time, a simple “no” is plenty.`,
  },
  es: {
    subject: (c) => `Propuesta para ${c}`,
    greeting: (n) => (n ? `Hola ${n},` : `Hola,`),
    openerBlurb: (c, b) =>
      `Vi ${c} y me llamó la atención lo que hacen — especialmente: "${b}".`,
    openerSite: (c, h) =>
      `Estuve mirando ${c} (${h}) y me pareció un buen momento para escribirles.`,
    openerPlain: (c) => `Estuve revisando ${c} y quise contactarlos directamente.`,
    defaultPitch: (niche) =>
      `Trabajo con ${niche || "equipos como el suyo"} para convertir visitas web en conversaciones reales — sin sumar más carga operativa al día a día.`,
    cta: `¿Tendrían 10 minutos la semana que viene para ver si encaja? Si no es el momento, no hay problema — con un “no” me alcanza.`,
  },
  fr: {
    subject: (c) => `Proposition pour ${c}`,
    greeting: (n) => (n ? `Bonjour ${n},` : `Bonjour,`),
    openerBlurb: (c, b) =>
      `J’ai découvert ${c} et ce que vous faites m’a parlé — notamment : « ${b} ».`,
    openerSite: (c, h) =>
      `J’ai regardé ${c} (${h}) et j’ai pensé que c’était le bon moment pour vous écrire.`,
    openerPlain: (c) => `J’ai passé du temps sur ${c} et souhaitais vous contacter directement.`,
    defaultPitch: (niche) =>
      `J’aide ${niche || "des équipes comme la vôtre"} à transformer les visites web en vraies conversations — sans alourdir le quotidien.`,
    cta: `Auriez-vous 10 minutes la semaine prochaine pour voir si ça peut matcher ? Sinon, un simple « non » suffit.`,
  },
  it: {
    subject: (c) => `Proposta per ${c}`,
    greeting: (n) => (n ? `Ciao ${n},` : `Ciao,`),
    openerBlurb: (c, b) =>
      `Ho visto ${c} e mi ha colpito quello che fate — in particolare: "${b}".`,
    openerSite: (c, h) =>
      `Stavo guardando ${c} (${h}) e mi è sembrato un buon momento per scrivervi.`,
    openerPlain: (c) => `Ho dato un’occhiata a ${c} e volevo contattarvi direttamente.`,
    defaultPitch: (niche) =>
      `Lavoro con ${niche || "team come il vostro"} per trasformare le visite al sito in conversazioni vere — senza aggiungere carico operativo.`,
    cta: `Avreste 10 minuti la prossima settimana per capire se ha senso? Se non è il momento, basta un “no”.`,
  },
  de: {
    subject: (c) => `Vorschlag für ${c}`,
    greeting: (n) => (n ? `Hallo ${n},` : `Hallo,`),
    openerBlurb: (c, b) =>
      `Ich bin auf ${c} gestoßen und fand spannend, was ihr macht — besonders: „${b}“.`,
    openerSite: (c, h) =>
      `Ich habe mir ${c} (${h}) angeschaut und dachte, es ist ein guter Zeitpunkt für eine kurze Nachricht.`,
    openerPlain: (c) => `Ich habe mir ${c} angesehen und wollte euch direkt ansprechen.`,
    defaultPitch: (niche) =>
      `Ich helfe ${niche || "Teams wie eurem"}, Website-Besuche in echte Gespräche zu verwandeln — ohne mehr Tagesgeschäft.`,
    cta: `Hättet ihr nächste Woche 10 Minuten, um zu prüfen, ob es passt? Falls nicht der richtige Zeitpunkt: ein „nein“ reicht völlig.`,
  },
  pt: {
    subject: (c) => `Proposta para ${c}`,
    greeting: (n) => (n ? `Olá ${n},` : `Olá,`),
    openerBlurb: (c, b) =>
      `Vi a ${c} e gostei do que fazem — especialmente: "${b}".`,
    openerSite: (c, h) =>
      `Estive a ver a ${c} (${h}) e pareceu-me um bom momento para escrever.`,
    openerPlain: (c) => `Estive a rever a ${c} e quis contactá-los diretamente.`,
    defaultPitch: (niche) =>
      `Trabalho com ${niche || "equipas como a vossa"} para transformar visitas no site em conversas reais — sem acrescentar carga operacional.`,
    cta: `Teriam 10 minutos na próxima semana para ver se faz sentido? Se não for o momento, um “não” chega.`,
  },
};

export function generateDraft(lead: Lead, run: Run): DraftResult {
  const lang = outreachLangFromLocation(lead.location);
  const copy = COPY[lang];
  const name = firstName(lead);
  const company = shortCompany(lead);
  const offer = run.offerNotes?.trim();
  const nicheHint = run.niche.trim();
  const signOff = (run.senderName?.trim() || env.fromName()).replace(/\r\n/g, "\n");

  const subject = copy.subject(company);
  const greeting = copy.greeting(name);

  const blurb = lead.aboutBlurb?.trim() ?? "";
  const blurbLooksLikePolicy =
    /cookie|privacy|identif|gdpr|personalize your experience|terms of/i.test(blurb);

  let opener: string;
  if (blurb && !blurbLooksLikePolicy) {
    opener = copy.openerBlurb(company, truncate(blurb, 90));
  } else if (lead.website) {
    const host = lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    opener = copy.openerSite(company, host);
  } else {
    opener = copy.openerPlain(company);
  }

  const pitch = offer || copy.defaultPitch(nicheHint);

  const body = [greeting, "", opener, "", pitch, "", copy.cta, "", signOff].join("\n");

  return { subject, body };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

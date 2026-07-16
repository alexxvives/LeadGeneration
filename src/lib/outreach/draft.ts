import {
  outreachLangFromLocation,
  type OutreachLang,
} from "@/lib/outreach/locale";
import {
  looksLikeHtml,
  normalizePitchHtml,
  plainToHtmlFragment,
} from "@/lib/outreach/rich-text";
import type { Lead, Run } from "@/lib/types";

// Deterministic, no-API-key outreach drafting. Language follows lead geography
// (see locale.ts). LLM is optional for blurbs/pitch only — drafts stay template
// so zero-key demo mode always works (constitution Art. I.2).
// Bodies stay natural — no STOP / mailing-address footers (ADR 0012).

export interface DraftResult {
  subject: string;
  body: string;
}

export interface DraftOverrides {
  /** Outreach profile email sign-off (multi-line). Prefer over run.senderName. */
  signOff?: string | null;
  /** Current Settings sales pitch. Prefer over run.offerNotes. */
  offerNotes?: string | null;
  /**
   * Subject template with `{lead_name}`, `{company}`, `{location}`.
   * Empty / unset → locale default subject.
   * `{lead_name}` = contact name when present, otherwise company.
   */
  subjectTemplate?: string | null;
  /** Force outreach language (Settings preview). Else inferred from lead.location. */
  forceLang?: OutreachLang;
  /**
   * When true (default): email body template + optional sign-off only —
   * no auto greeting, scraped opener, or stock CTA.
   * @deprecated Prefer aiPersonalize=false for the same behavior.
   */
  staticBody?: boolean;
  /**
   * When true, caller should AI-vary the draft per lead (see service.draftOutreach).
   * When false/omitted with staticBody, use the template text as-is (placeholders only).
   */
  aiPersonalize?: boolean;
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

/** Resolve `{lead_name}` / `{company}` / `{location}` in subject or pitch text. */
export function applySubjectTemplate(template: string, lead: Lead): string {
  const company = shortCompany(lead);
  // contactName is often missing on scraped leads — fall back to company.
  const leadName = (lead.contactName?.trim() || company).trim();
  const location = (lead.location ?? "").trim();
  return template
    .replace(/\{lead_name\}/gi, leadName)
    .replace(/\{company\}/gi, company)
    .replace(/\{location\}/gi, location)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Same placeholders, but keep newlines / HTML (for pitch / static body). */
function applyBodyPlaceholders(template: string, lead: Lead): string {
  const company = shortCompany(lead);
  const leadName = (lead.contactName?.trim() || company).trim();
  const location = (lead.location ?? "").trim();
  // Escape replacements so user-controlled names never inject tags into HTML bodies.
  const esc = (s: string) =>
    looksLikeHtml(template)
      ? s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
      : s;
  return template
    .replace(/\{lead_name\}/gi, esc(leadName))
    .replace(/\{company\}/gi, esc(company))
    .replace(/\{location\}/gi, esc(location))
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

function joinBodyParts(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join(parts.some(looksLikeHtml) ? "<br><br>" : "\n\n");
}

/**
 * Strip legacy compliance blocks that were once baked into draft bodies
 * (Sent by… / unsubscribe mailto / STOP lines / addresses). Safe to run at send
 * so old drafts stay natural (ADR 0012).
 */
export function stripLegacyCompliance(body: string): string {
  let out = body.replace(/\r\n/g, "\n");
  // Old initial-commit footer (often still sitting in saved drafts).
  out = out.replace(
    /\n*—\s*\nSent by[^\n]*(?:\n(?!—)[^\n]*)*\n?Don't want to hear from us\?[^\n]*/gi,
    "",
  );
  out = out.replace(/\n*Don't want to hear from us\?[^\n]*/gi, "");
  out = out.replace(/\{\{unsubscribe_url\}\}/gi, "");
  // Prior send-appended STOP blocks.
  out = out.replace(
    /\n*—\s*\n(?:If you[’']d rather not hear from us, reply STOP\.|Si prefieres no recibir más mensajes, responde STOP\.)\s*$/i,
    "",
  );
  out = out.replace(
    /\n+(?:If you[’']d rather not hear from us, reply STOP\.|Si prefieres no recibir más mensajes, responde STOP\.)\s*$/i,
    "",
  );
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** True when scraped "about" text is nav/chrome junk, not a real company blurb. */
export function blurbLooksLikeJunk(blurb: string): boolean {
  const t = blurb.trim();
  if (!t || t.length < 20) return true;
  if (
    /cookie|privacy|identif|gdpr|personalize your experience|terms of|skip to content/i.test(
      t,
    )
  ) {
    return true;
  }
  // Collapsed nav: "Login View Plans closeClose Menu Contact…"
  if (
    /\b(login|sign in|view plans|close menu|schedules?|premium\s*member|culers)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // Too many jammed TitleCase tokens without spaces between (scrape collapse).
  if (/[a-z][A-Z][a-z]+[A-Z]/.test(t) && t.split(/\s+/).length < 8) return true;
  return false;
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
    subject: (c) => `Quick note for ${c}`,
    greeting: (n) => (n ? `Hi ${n},` : `Hi,`),
    openerBlurb: (c, b) =>
      `Saw ${c} while looking into the space — ${b}`,
    openerSite: (c, h) =>
      `Spent a few minutes on ${h} and wanted to write ${c} directly.`,
    openerPlain: (c) => `Wanted to get in touch with ${c} directly.`,
    defaultPitch: (niche) =>
      `I work with ${niche || "teams like yours"} on turning inbound interest into booked conversations — quietly, without a big process change.`,
    cta: `If you’d like to see how this could fit your model, happy to do a 15-minute demo — no commitment.`,
  },
  es: {
    subject: (c) => `Nota para ${c}`,
    greeting: (n) => (n ? `Hola ${n},` : `Hola,`),
    openerBlurb: (c, b) =>
      `Vi ${c} investigando el sector — ${b}`,
    openerSite: (c, h) =>
      `Pasé unos minutos por ${h} y quise escribir a ${c} directamente.`,
    openerPlain: (c) => `Quería contactar a ${c} directamente.`,
    defaultPitch: (niche) =>
      `Trabajo con ${niche || "equipos como el suyo"} para convertir el interés entrante en conversaciones concretas — sin montar un proceso complicado.`,
    cta: `Si os interesa ver cómo encajaría con vuestro modelo, podemos hacer una demo de 15 minutos sin compromiso.`,
  },
  fr: {
    subject: (c) => `Petit message pour ${c}`,
    greeting: (n) => (n ? `Bonjour ${n},` : `Bonjour,`),
    openerBlurb: (c, b) =>
      `J’ai vu ${c} en regardant le secteur — ${b}`,
    openerSite: (c, h) =>
      `J’ai passé quelques minutes sur ${h} et voulais écrire à ${c} directement.`,
    openerPlain: (c) => `Je voulais contacter ${c} directement.`,
    defaultPitch: (niche) =>
      `J’aide ${niche || "des équipes comme la vôtre"} à transformer l’intérêt entrant en vraies conversations — sans changer tout le process.`,
    cta: `Si vous voulez voir comment ça s’intégrerait à votre modèle, on peut faire une démo de 15 minutes — sans engagement.`,
  },
  it: {
    subject: (c) => `Nota per ${c}`,
    greeting: (n) => (n ? `Ciao ${n},` : `Ciao,`),
    openerBlurb: (c, b) =>
      `Ho visto ${c} mentre guardavo il settore — ${b}`,
    openerSite: (c, h) =>
      `Ho passato qualche minuto su ${h} e volevo scrivere a ${c} direttamente.`,
    openerPlain: (c) => `Volevo contattare ${c} direttamente.`,
    defaultPitch: (niche) =>
      `Lavoro con ${niche || "team come il vostro"} per trasformare l’interesse in conversazioni concrete — senza stravolgere il processo.`,
    cta: `Se vi interessa vedere come si adatterebbe al vostro modello, possiamo fare una demo di 15 minuti senza impegno.`,
  },
  de: {
    subject: (c) => `Kurze Notiz für ${c}`,
    greeting: (n) => (n ? `Hallo ${n},` : `Hallo,`),
    openerBlurb: (c, b) =>
      `Bin bei der Recherche auf ${c} gestoßen — ${b}`,
    openerSite: (c, h) =>
      `Habe mir ${h} kurz angeschaut und wollte ${c} direkt schreiben.`,
    openerPlain: (c) => `Wollte ${c} direkt ansprechen.`,
    defaultPitch: (niche) =>
      `Ich helfe ${niche || "Teams wie eurem"}, eingehendes Interesse in echte Gespräche zu verwandeln — ohne großen Prozesswechsel.`,
    cta: `Wenn ihr sehen wollt, wie das zu eurem Modell passen könnte, machen wir gerne eine unverbindliche 15-Minuten-Demo.`,
  },
  pt: {
    subject: (c) => `Nota para ${c}`,
    greeting: (n) => (n ? `Olá ${n},` : `Olá,`),
    openerBlurb: (c, b) =>
      `Vi a ${c} enquanto explorava o setor — ${b}`,
    openerSite: (c, h) =>
      `Passei uns minutos em ${h} e quis escrever à ${c} diretamente.`,
    openerPlain: (c) => `Quis contactar a ${c} diretamente.`,
    defaultPitch: (niche) =>
      `Trabalho com ${niche || "equipas como a vossa"} para transformar interesse em conversas concretas — sem mudar o processo todo.`,
    cta: `Se quiserem ver como encaixaria no vosso modelo, podemos fazer uma demo de 15 minutos — sem compromisso.`,
  },
  pl: {
    subject: (c) => `Krótka wiadomość dla ${c}`,
    greeting: (n) => (n ? `Cześć ${n},` : `Cześć,`),
    openerBlurb: (c, b) =>
      `Natknąłem się na ${c} przeglądając branżę — ${b}`,
    openerSite: (c, h) =>
      `Spędziłem chwilę na ${h} i chciałem napisać bezpośrednio do ${c}.`,
    openerPlain: (c) => `Chciałem skontaktować się bezpośrednio z ${c}.`,
    defaultPitch: (niche) =>
      `Pomagam ${niche || "zespołom takim jak Wasz"} zamieniać zainteresowanie w konkretne rozmowy — bez wielkiej zmiany procesu.`,
    cta: `Jeśli chcecie zobaczyć, jak to wpasuje się w Wasz model, możemy zrobić 15-minutowe demo — bez zobowiązań.`,
  },
};

export function generateDraft(
  lead: Lead,
  run: Run,
  overrides?: DraftOverrides,
): DraftResult {
  const lang = overrides?.forceLang ?? outreachLangFromLocation(lead.location);
  const copy = COPY[lang];
  const name = firstName(lead);
  const company = shortCompany(lead);
  const offerRaw =
    overrides?.offerNotes?.trim() || run.offerNotes?.trim() || "";
  const nicheHint = run.niche.trim();
  // Sign-off comes from the outreach profile only — never inbox From name.
  const signOffPlain = (
    overrides?.signOff?.trim() ||
    run.senderName?.trim() ||
    ""
  ).replace(/\r\n/g, "\n");

  const subjectTpl = overrides?.subjectTemplate?.trim();
  const subject = subjectTpl
    ? applySubjectTemplate(subjectTpl, lead) || copy.subject(company)
    : copy.subject(company);
  const greeting = copy.greeting(name);

  // Template path: use the profile pitch as-is (placeholders only). Never invent
  // a default pitch / greeting — empty profile → empty body (+ optional sign-off).
  // Preserve bold/italic/lists from the pitch editor as light HTML.
  const assembleLegacy =
    overrides?.staticBody === false && !overrides?.aiPersonalize;
  if (!assembleLegacy) {
    const pitchHtml = offerRaw
      ? applyBodyPlaceholders(normalizePitchHtml(offerRaw), lead)
      : "";
    const signOffHtml = signOffPlain
      ? plainToHtmlFragment(signOffPlain)
      : "";
    return { subject, body: joinBodyParts([pitchHtml, signOffHtml]) };
  }

  const pitchHtml = applyBodyPlaceholders(
    normalizePitchHtml(offerRaw || copy.defaultPitch(nicheHint)),
    lead,
  );
  const signOffHtml = signOffPlain
    ? plainToHtmlFragment(signOffPlain)
    : "";

  const blurb = lead.aboutBlurb?.trim() ?? "";

  let opener: string;
  if (blurb && !blurbLooksLikeJunk(blurb)) {
    // Period if the blurb doesn't already end with punctuation.
    const hook = /[.!?…]$/.test(blurb) ? blurb : `${blurb}.`;
    opener = copy.openerBlurb(company, truncate(hook, 110));
  } else if (lead.website) {
    const host = lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    opener = copy.openerSite(company, host);
  } else {
    opener = copy.openerPlain(company);
  }

  const body = joinBodyParts([
    plainToHtmlFragment(greeting),
    plainToHtmlFragment(opener),
    pitchHtml,
    plainToHtmlFragment(copy.cta),
    signOffHtml,
  ]);

  return { subject, body };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

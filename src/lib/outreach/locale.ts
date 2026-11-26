/**
 * Outreach language from lead geography.
 * Used by template drafts (and optional LLM blurbs) so cold email matches the market.
 */

export type OutreachLang = "en" | "es" | "fr" | "it" | "de" | "pt" | "pl";

/**
 * How a profile maps geography onto a draft language.
 * - `default`: Spanish-speaking countries → es, France/French-speaking → fr, etc.
 * - `spainEsFranceFrElseEn`: Spain → es, France → fr, everywhere else → en
 *   (AKADEMO rule). LatAm, Italy, UK, US, etc. all draft in English.
 */
export type LangRouting = "default" | "spainEsFranceFrElseEn";

/** Lead fields used to infer language. */
export type LeadLangInput = {
  location?: string | null;
  website?: string | null;
  emails?: ReadonlyArray<string> | null;
  phones?: ReadonlyArray<string> | null;
};

export type GeoBucket = "ES" | "FR" | "OTHER" | "UNKNOWN";

export type LangEvidence = {
  lang: OutreachLang;
  /** False when location, TLD, and phone are all blank or unrecognized. */
  confident: boolean;
  bucket: GeoBucket;
};

export const LANG_ROUTING_VALUES: LangRouting[] = [
  "default",
  "spainEsFranceFrElseEn",
];

export function isLangRouting(v: unknown): v is LangRouting {
  return typeof v === "string" && (LANG_ROUTING_VALUES as string[]).includes(v);
}

const SPAIN_COUNTRY =
  /\b(spain|españa|espana|español|espanol)\b/i;
const SPAIN_CITIES =
  /\b(madrid|barcelona|valencia|sevilla|seville|bilbao|zaragoza|m[aá]laga|malaga|palma|murcia|alicante|c[oó]rdoba|cordoba|granada|vigo|gij[oó]n|gijon|oviedo|pamplona|santander|salamanca|valladolid|tarragona|girona|c[aá]diz|cadiz|almer[ií]a|almeria|toledo|burgos|le[oó]n\b|logro[nñ]o|logrono|castell[oó]n|castellon|elche|l'?hospitalet|hospitalet|badalona|sabadell|terrassa|jerez|marbella|donostia|san\s*sebasti[aá]n|san\s*sebastian|a\s*coru[nñ]a|la\s*coru[nñ]a|coruna|vitoria|getafe|mostoles|m[oó]stoles|alcal[aá]|almeria|huelva|l[eé]rida|lleida|ourense|orense|lugo|pontevedra|huesca|teruel|cuenca|albacete|badajoz|c[aá]ceres|caceres|ciudad\s*real|segovia|avila|[áa]vila|soria|palencia|zamora|guadalajara|tarragona|reus|mataro|matar[oó]|santa\s*cruz\s*de\s*tenerife|las\s*palmas|tenerife|mallorca|ibiza|menorca|pamplona|irun|irún)\b/i;

const LATAM_COUNTRY =
  /\b(mexico|méxico|argentina|colombia|chile|peru|perú|venezuela|ecuador|uruguay|paraguay|bolivia|guatemala|honduras|nicaragua|salvador|costa\s*rica|panama|panamá|cuba|dominican|puerto\s*rico|andorra)\b/i;
const LATAM_CITIES =
  /\b(mexico\s*city|ciudad\s*de\s*m[eé]xico|guadalajara|monterrey|puebla|tijuana|buenos\s*aires|c[oó]rdoba,\s*arg|bogot[aá]|medell[ií]n|cali|santiago|valpara[ií]so|lima|caracas|quito|guayaquil|montevideo|asunci[oó]n|la\s*paz|santa\s*cruz|san\s*juan|santo\s*domingo|havana|habana)\b/i;

const FRANCE_COUNTRY = /\b(france|francia|french\s*republic)\b/i;
const FRANCE_CITIES =
  /\b(paris|lyon|marseille|toulouse|bordeaux|nantes|lille|strasbourg|nice|rennes|reims|toulon|montpellier|grenoble|dijon|angers|le\s*havre|saint-?[eé]tienne|aix-en-provence|n[iî]mes|nimes|clermont-ferrand|tours|limoges|amiens|perpignan|metz|besan[cç]on|orléans|orleans|rouen|caen|mulhouse|nancy|argenteuil|avignon)\b/i;

const FRENCH_OTHER_COUNTRY =
  /\b(belgium|belgique|belgi[eë]|luxembourg|monaco|senegal|sénégal|ivory\s*coast|c[oô]te\s*d['’]?ivoire|quebec|qu[eé]bec)\b/i;
const FRENCH_OTHER_CITIES = /\b(montr[eé]al|montreal|brussels|bruxelles|brussel|li[eè]ge|liege|antwerp|charleroi|geneva|gen[eè]ve|lausanne|dakar|abidjan)\b/i;

const ITALY_COUNTRY = /\b(italy|italia|san\s*marino|vatican)\b/i;
const ITALY_CITIES =
  /\b(rome|roma|milan|milano|naples|napoli|turin|torino|florence|firenze|bologna|genoa|genova|palermo|venice|venezia|verona|padua|padova|bari|catania|messina)\b/i;

const GERMAN_COUNTRY =
  /\b(germany|deutschland|austria|österreich|osterreich|liechtenstein)\b/i;
const GERMAN_CITIES =
  /\b(berlin|munich|m[uü]nchen|munchen|hamburg|frankfurt|cologne|k[oö]ln|koln|vienna|wien|zurich|z[uü]rich|stuttgart|d[uü]sseldorf|dusseldorf|dortmund|essen|leipzig|bremen|dresden|hannover|nuremberg|n[uü]rnberg|salzburg|innsbruck|graz)\b/i;

const PORTUGAL_COUNTRY = /\b(portugal)\b/i;
const BRAZIL_COUNTRY = /\b(brazil|brasil)\b/i;
const PORTUGUESE_OTHER = /\b(angola|mozambique|mo[cç]ambique)\b/i;
const PORTUGUESE_CITIES =
  /\b(lisbon|lisboa|porto|oporto|braga|coimbra|faro|s[aã]o\s*paulo|sao\s*paulo|rio\s*de\s*janeiro|bras[ií]lia|brasilia|salvador|belo\s*horizonte|recife|fortaleza|manaus|curitiba|porto\s*alegre)\b/i;

const POLISH_COUNTRY = /\b(poland|polska|polish)\b/i;
const POLISH_CITIES =
  /\b(warsaw|warszawa|krak[oó]w|krakow|wroc[lł]aw|wroclaw|gda[nń]sk|gdansk|pozna[nń]|poznan|[lł][oó]d[zź]|lodz)\b/i;

const ENGLISH_COUNTRY =
  /\b(united\s*states|usa|u\.s\.a?\.?|uk|united\s*kingdom|great\s*britain|england|scotland|wales|northern\s*ireland|ireland|canada|australia|new\s*zealand|singapore|india|philippines|nigeria|south\s*africa)\b/i;
const ENGLISH_CITIES =
  /\b(new\s*york|los\s*angeles|chicago|houston|miami|boston|seattle|san\s*francisco|washington|london|manchester|birmingham|edinburgh|glasgow|cardiff|belfast|dublin|toronto|vancouver|sydney|melbourne|auckland|wellington)\b/i;

/** ccTLDs that imply a language. Generic gTLDs are ignored. */
const TLD_LANG: Record<string, { lang: OutreachLang; bucket: GeoBucket }> = {
  es: { lang: "es", bucket: "ES" },
  fr: { lang: "fr", bucket: "FR" },
  it: { lang: "it", bucket: "OTHER" },
  de: { lang: "de", bucket: "OTHER" },
  at: { lang: "de", bucket: "OTHER" },
  pt: { lang: "pt", bucket: "OTHER" },
  br: { lang: "pt", bucket: "OTHER" },
  pl: { lang: "pl", bucket: "OTHER" },
  uk: { lang: "en", bucket: "OTHER" },
  ie: { lang: "en", bucket: "OTHER" },
  us: { lang: "en", bucket: "OTHER" },
  ca: { lang: "en", bucket: "OTHER" },
  au: { lang: "en", bucket: "OTHER" },
  nz: { lang: "en", bucket: "OTHER" },
};

const GENERIC_TLDS = new Set([
  "com",
  "org",
  "net",
  "io",
  "co",
  "edu",
  "gov",
  "info",
  "biz",
  "xyz",
  "app",
  "dev",
  "ai",
  "me",
  "cc",
  "tv",
  "site",
  "online",
  "store",
  "shop",
  "tech",
  "cloud",
  "pro",
  "club",
  "eu",
  "intl",
]);

/** Longest-prefix first. */
const PHONE_PREFIXES: Array<{
  prefix: string;
  lang: OutreachLang;
  bucket: GeoBucket;
}> = [
  { prefix: "+351", lang: "pt", bucket: "OTHER" },
  { prefix: "+353", lang: "en", bucket: "OTHER" },
  { prefix: "+34", lang: "es", bucket: "ES" },
  { prefix: "+33", lang: "fr", bucket: "FR" },
  { prefix: "+39", lang: "it", bucket: "OTHER" },
  { prefix: "+49", lang: "de", bucket: "OTHER" },
  { prefix: "+43", lang: "de", bucket: "OTHER" },
  { prefix: "+55", lang: "pt", bucket: "OTHER" },
  { prefix: "+48", lang: "pl", bucket: "OTHER" },
  { prefix: "+44", lang: "en", bucket: "OTHER" },
  { prefix: "+61", lang: "en", bucket: "OTHER" },
  { prefix: "+64", lang: "en", bucket: "OTHER" },
  { prefix: "+1", lang: "en", bucket: "OTHER" },
];

function locationLang(location: string): LangEvidence | null {
  const loc = location.trim();
  if (!loc) return null;

  // Country names first so "Guadalajara, Mexico" is not swallowed by the
  // Spanish city of the same name.
  if (SPAIN_COUNTRY.test(loc)) {
    return { lang: "es", confident: true, bucket: "ES" };
  }
  if (LATAM_COUNTRY.test(loc)) {
    return { lang: "es", confident: true, bucket: "OTHER" };
  }
  if (FRANCE_COUNTRY.test(loc)) {
    return { lang: "fr", confident: true, bucket: "FR" };
  }
  if (FRENCH_OTHER_COUNTRY.test(loc)) {
    return { lang: "fr", confident: true, bucket: "OTHER" };
  }
  if (ITALY_COUNTRY.test(loc)) {
    return { lang: "it", confident: true, bucket: "OTHER" };
  }
  if (GERMAN_COUNTRY.test(loc)) {
    return { lang: "de", confident: true, bucket: "OTHER" };
  }
  if (PORTUGAL_COUNTRY.test(loc) || BRAZIL_COUNTRY.test(loc) || PORTUGUESE_OTHER.test(loc)) {
    return { lang: "pt", confident: true, bucket: "OTHER" };
  }
  if (POLISH_COUNTRY.test(loc)) {
    return { lang: "pl", confident: true, bucket: "OTHER" };
  }
  if (ENGLISH_COUNTRY.test(loc)) {
    return { lang: "en", confident: true, bucket: "OTHER" };
  }

  // Switzerland is mixed — only pin a language with a regional hint.
  if (/\b(switzerland|schweiz|suisse|svizzera)\b/i.test(loc)) {
    if (/suisse|romand|geneva|gen[eè]ve|lausanne/i.test(loc)) {
      return { lang: "fr", confident: true, bucket: "OTHER" };
    }
    if (/ticino|lugano/i.test(loc)) {
      return { lang: "it", confident: true, bucket: "OTHER" };
    }
    return { lang: "de", confident: true, bucket: "OTHER" };
  }

  if (SPAIN_CITIES.test(loc)) {
    return { lang: "es", confident: true, bucket: "ES" };
  }
  if (LATAM_CITIES.test(loc)) {
    return { lang: "es", confident: true, bucket: "OTHER" };
  }
  if (FRANCE_CITIES.test(loc)) {
    return { lang: "fr", confident: true, bucket: "FR" };
  }
  if (FRENCH_OTHER_CITIES.test(loc)) {
    return { lang: "fr", confident: true, bucket: "OTHER" };
  }
  if (ITALY_CITIES.test(loc)) {
    return { lang: "it", confident: true, bucket: "OTHER" };
  }
  if (GERMAN_CITIES.test(loc)) {
    return { lang: "de", confident: true, bucket: "OTHER" };
  }
  if (PORTUGUESE_CITIES.test(loc)) {
    return { lang: "pt", confident: true, bucket: "OTHER" };
  }
  if (POLISH_CITIES.test(loc)) {
    return { lang: "pl", confident: true, bucket: "OTHER" };
  }
  if (ENGLISH_CITIES.test(loc)) {
    return { lang: "en", confident: true, bucket: "OTHER" };
  }

  return null;
}

function hostFromValue(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let input = raw;
  if (input.includes("@") && !input.includes("://")) {
    input = input.split("@").pop() ?? "";
  }
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  try {
    const host = new URL(input).hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function langFromHost(host: string | null): LangEvidence | null {
  if (!host) return null;
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const last = labels[labels.length - 1]!;
  const second = labels[labels.length - 2]!;
  if (last === "uk" && second === "co") {
    return { lang: "en", confident: true, bucket: "OTHER" };
  }
  if (GENERIC_TLDS.has(last)) return null;
  const hit = TLD_LANG[last];
  if (!hit) return null;
  return { lang: hit.lang, confident: true, bucket: hit.bucket };
}

function langFromPhone(phone: string | null | undefined): LangEvidence | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const compact = raw.replace(/[^\d+]/g, "");
  let n = compact;
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  // Require an explicit international prefix so local 6xx/7xx numbers
  // are not guessed as a country.
  if (!n.startsWith("+")) return null;
  for (const row of PHONE_PREFIXES) {
    if (n.startsWith(row.prefix) && n.length > row.prefix.length) {
      return { lang: row.lang, confident: true, bucket: row.bucket };
    }
  }
  return null;
}

function applyRouting(evidence: LangEvidence, routing: LangRouting): LangEvidence {
  if (routing !== "spainEsFranceFrElseEn") return evidence;
  if (evidence.bucket === "ES") {
    return { ...evidence, lang: "es" };
  }
  if (evidence.bucket === "FR") {
    return { ...evidence, lang: "fr" };
  }
  if (evidence.bucket === "OTHER") {
    return { ...evidence, lang: "en" };
  }
  return { lang: "en", confident: false, bucket: "UNKNOWN" };
}

/**
 * Infer outreach language from a free-text location (city, region, country).
 * Defaults to English when unknown — safest for mixed / missing geo.
 */
export function outreachLangFromLocation(
  location: string | null | undefined,
): OutreachLang {
  const hit = location?.trim() ? locationLang(location) : null;
  return hit?.lang ?? "en";
}

/** Lead-aware language: location, then website TLD, then email TLD, then phone. */
export function outreachLangEvidenceForLead(
  lead: LeadLangInput | string | null | undefined,
  routing: LangRouting = "default",
): LangEvidence {
  const input: LeadLangInput =
    lead == null
      ? {}
      : typeof lead === "string"
        ? { location: lead }
        : lead;

  const fromLocation = input.location?.trim()
    ? locationLang(input.location)
    : null;
  if (fromLocation) return applyRouting(fromLocation, routing);

  const fromWebsite = langFromHost(hostFromValue(input.website ?? null));
  if (fromWebsite) return applyRouting(fromWebsite, routing);

  const primaryEmail = input.emails?.find((e) => e?.trim())?.trim() ?? "";
  const fromEmail = langFromHost(hostFromValue(primaryEmail));
  if (fromEmail) return applyRouting(fromEmail, routing);

  const primaryPhone = input.phones?.find((p) => p?.trim())?.trim() ?? "";
  const fromPhone = langFromPhone(primaryPhone);
  if (fromPhone) return applyRouting(fromPhone, routing);

  return { lang: "en", confident: false, bucket: "UNKNOWN" };
}

export function outreachLangForLead(
  lead: LeadLangInput | string | null | undefined,
  routing: LangRouting = "default",
): OutreachLang {
  return outreachLangEvidenceForLead(lead, routing).lang;
}

export function langLabel(lang: OutreachLang): string {
  switch (lang) {
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "it":
      return "Italian";
    case "de":
      return "German";
    case "pt":
      return "Portuguese";
    case "pl":
      return "Polish";
    default:
      return "English";
  }
}

/** Short uppercase badge for queue rows (ES, EN, FR, …). */
export function langBadge(lang: OutreachLang): string {
  return lang.toUpperCase();
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const DISTINCTIVE: Record<OutreachLang, string[]> = {
  es: [
    "propuesta",
    "buenas",
    "buenos días",
    "buenos dias",
    "hola",
    "me pongo",
    "os contacto",
    "nosotros",
    "ustedes",
    "también",
    "tambien",
    "información",
    "informacion",
    "encantar",
    "academias",
    "muchas academias",
    "sin compromiso",
  ],
  en: [
    "quick note",
    "hi,",
    "hello",
    "wanted to",
    "i work with",
    "reaching out",
    "happy to",
    "no commitment",
  ],
  fr: [
    "petit message",
    "bonjour",
    "je vous",
    "nous travaillons",
    "sans engagement",
  ],
  it: ["piccolo messaggio", "ciao", "vi contatto", "un saluto"],
  de: ["kurze nachricht", "guten tag", "sehr geehrte", "mit freundlichen"],
  pt: ["proposta", "olá", "ola", "gostaria", "sem compromisso"],
  pl: ["szybka wiadomość", "dzień dobry", "dzien dobry", "propozycja"],
};

function distinctiveScore(sample: string, phrases: string[]): number {
  let n = 0;
  for (const phrase of phrases) {
    if (sample.includes(phrase)) n += phrase.includes(" ") ? 2 : 1;
  }
  return n;
}

export type TextLangEvidence = {
  lang: OutreachLang;
  confident: boolean;
};

/**
 * Cheap language guess from page or draft text. Counts common function words
 * and a few distinctive outreach phrases; defaults to English when unsure.
 */
export function outreachLangEvidenceFromText(
  text: string | null | undefined,
): TextLangEvidence {
  const sample = stripHtml(text ?? "").toLowerCase();
  if (sample.length < 8) return { lang: "en", confident: false };

  const scores: Record<OutreachLang, number> = {
    es: distinctiveScore(sample, DISTINCTIVE.es),
    en: distinctiveScore(sample, DISTINCTIVE.en),
    fr: distinctiveScore(sample, DISTINCTIVE.fr),
    it: distinctiveScore(sample, DISTINCTIVE.it),
    de: distinctiveScore(sample, DISTINCTIVE.de),
    pt: distinctiveScore(sample, DISTINCTIVE.pt),
    pl: distinctiveScore(sample, DISTINCTIVE.pl),
  };

  const functionWords: Record<OutreachLang, string[]> = {
    es: ["el", "la", "los", "las", "una", "para", "con", "por", "como", "más", "que", "gestiona"],
    pt: ["uma", "para", "com", "não", "você", "pelo", "pela", "está", "são"],
    fr: ["les", "des", "une", "pour", "avec", "dans", "est", "vous", "nous", "être"],
    it: ["che", "una", "per", "con", "del", "sono", "della", "degli", "nel"],
    de: ["der", "die", "das", "und", "den", "mit", "für", "von", "ist", "ein", "eine"],
    pl: ["nie", "się", "jest", "oraz", "przy", "dla", "tego", "może", "które", "który"],
    en: ["the", "and", "for", "with", "your", "you", "our", "that", "this", "from", "are", "we"],
  };

  const scoreFn = (words: string[]) =>
    words.reduce(
      (n, w) => n + (sample.match(new RegExp(`\\b${w}\\b`, "g"))?.length ?? 0),
      0,
    );

  let distinctiveBest: OutreachLang = "en";
  let distinctiveTop = -1;
  let distinctiveSecond = -1;
  for (const lang of Object.keys(scores) as OutreachLang[]) {
    if (scores[lang] > distinctiveTop) {
      distinctiveSecond = distinctiveTop;
      distinctiveTop = scores[lang];
      distinctiveBest = lang;
    } else if (scores[lang] > distinctiveSecond) {
      distinctiveSecond = scores[lang];
    }
  }

  if (distinctiveTop >= 1 && distinctiveTop > distinctiveSecond) {
    return { lang: distinctiveBest, confident: true };
  }

  if (sample.length < 40) return { lang: "en", confident: false };

  const fnScores: Record<OutreachLang, number> = {
    es: scoreFn(functionWords.es),
    pt: scoreFn(functionWords.pt),
    fr: scoreFn(functionWords.fr),
    it: scoreFn(functionWords.it),
    de: scoreFn(functionWords.de),
    pl: scoreFn(functionWords.pl),
    en: scoreFn(functionWords.en),
  };

  let best: OutreachLang = "en";
  let bestScore = -1;
  let second = -1;
  for (const lang of Object.keys(fnScores) as OutreachLang[]) {
    if (fnScores[lang] > bestScore) {
      second = bestScore;
      bestScore = fnScores[lang];
      best = lang;
    } else if (fnScores[lang] > second) {
      second = fnScores[lang];
    }
  }
  if (bestScore >= 3 && bestScore > second) {
    return { lang: best, confident: true };
  }
  return { lang: bestScore >= 3 ? best : "en", confident: false };
}

export function outreachLangFromText(text: string | null | undefined): OutreachLang {
  return outreachLangEvidenceFromText(text).lang;
}

/**
 * Why this draft must not be sent, or null if language looks fine (or we
 * are not confident enough to block).
 */
export function outreachLangMismatchIssue(
  draft: { subject?: string | null; body?: string | null },
  lead: LeadLangInput | string | null | undefined,
  opts?: { routing?: LangRouting },
): string | null {
  const routing = opts?.routing ?? "default";
  const expected = outreachLangEvidenceForLead(lead, routing);
  if (!expected.confident) return null;

  const draftText = `${draft.subject ?? ""} ${draft.body ?? ""}`;
  const detected = outreachLangEvidenceFromText(draftText);
  if (!detected.confident) return null;
  if (detected.lang === expected.lang) return null;

  return (
    `This draft looks ${langLabel(detected.lang)}, but the lead looks like a ` +
    `${langLabel(expected.lang)} contact. Redraft in ${langLabel(expected.lang)} ` +
    `or fix the language before sending.`
  );
}

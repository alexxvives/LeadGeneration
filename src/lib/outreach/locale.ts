/**
 * Outreach language from lead geography.
 * Used by template drafts (and optional LLM blurbs) so cold email matches the market.
 */

export type OutreachLang = "en" | "es" | "fr" | "it" | "de" | "pt" | "pl";

const COUNTRY_HINTS: Array<{ lang: OutreachLang; pattern: RegExp }> = [
  // Spanish-speaking
  {
    lang: "es",
    pattern:
      /\b(spain|españa|mexico|méxico|argentina|colombia|chile|peru|perú|venezuela|ecuador|uruguay|paraguay|bolivia|guatemala|honduras|nicaragua|salvador|costa\s*rica|panama|panamá|cuba|dominican|puerto\s*rico|andorra)\b/i,
  },
  // Portuguese
  {
    lang: "pt",
    pattern: /\b(portugal|brazil|brasil|angola|mozambique|moçambique)\b/i,
  },
  // French
  {
    lang: "fr",
    pattern:
      /\b(france|belgium|belgique|luxembourg|monaco|senegal|sénégal|ivory\s*coast|côte\s*d['’]?ivoire|quebec|québec)\b/i,
  },
  // Italian
  {
    lang: "it",
    pattern: /\b(italy|italia|san\s*marino|vatican)\b/i,
  },
  // German
  {
    lang: "de",
    pattern: /\b(germany|deutschland|austria|österreich|osterreich|liechtenstein)\b/i,
  },
  // Polish
  {
    lang: "pl",
    pattern: /\b(poland|polska|polish)\b/i,
  },
  // English-majority (explicit — also the default)
  {
    lang: "en",
    pattern:
      /\b(united\s*states|usa|u\.s\.a?\.?|uk|united\s*kingdom|england|scotland|wales|ireland|canada|australia|new\s*zealand|singapore|india|philippines|nigeria|south\s*africa)\b/i,
  },
];

/** City/region tokens that strongly imply a language when country isn't named. */
const CITY_HINTS: Array<{ lang: OutreachLang; pattern: RegExp }> = [
  {
    lang: "es",
    pattern:
      /\b(madrid|barcelona|valencia|sevilla|bilbao|mexico\s*city|ciudad\s*de\s*méxico|buenos\s*aires|bogot[aá]|santiago|lima|caracas|quito|montevideo)\b/i,
  },
  {
    lang: "pt",
    pattern: /\b(lisbon|lisboa|porto|são\s*paulo|sao\s*paulo|rio\s*de\s*janeiro|brasília|brasilia)\b/i,
  },
  {
    lang: "fr",
    pattern: /\b(paris|lyon|marseille|toulouse|bordeaux|nantes|lille|montréal|montreal)\b/i,
  },
  {
    lang: "it",
    pattern: /\b(rome|roma|milan|milano|naples|napoli|turin|torino|florence|firenze|bologna)\b/i,
  },
  {
    lang: "de",
    pattern: /\b(berlin|munich|münchen|munchen|hamburg|frankfurt|cologne|köln|koln|vienna|wien|zurich|zürich)\b/i,
  },
  {
    lang: "pl",
    pattern: /\b(warsaw|warszawa|krak[oó]w|krakow|wroc[lł]aw|wroclaw|gda[nń]sk|gdansk|pozna[nń]|poznan|[lł][oó]d[zź]|lodz)\b/i,
  },
  {
    lang: "en",
    pattern:
      /\b(new\s*york|los\s*angeles|chicago|houston|miami|boston|seattle|london|manchester|toronto|vancouver|sydney|melbourne|auckland|dublin)\b/i,
  },
];

/**
 * Infer outreach language from a free-text location (city, region, country).
 * Defaults to English when unknown — safest for mixed / missing geo.
 */
export function outreachLangFromLocation(location: string | null | undefined): OutreachLang {
  const loc = location?.trim() ?? "";
  if (!loc) return "en";

  for (const { lang, pattern } of COUNTRY_HINTS) {
    if (pattern.test(loc)) return lang;
  }
  for (const { lang, pattern } of CITY_HINTS) {
    if (pattern.test(loc)) return lang;
  }

  // Switzerland / Belgium: ambiguous — prefer French if "Suisse"/"Belgique", else EN
  if (/\b(switzerland|schweiz|suisse|svizzera)\b/i.test(loc)) {
    if (/suisse|romand|geneva|genève|lausanne/i.test(loc)) return "fr";
    if (/ticino|lugano/i.test(loc)) return "it";
    return "de";
  }
  if (/\b(belgium|belgi[eë]|belgique)\b/i.test(loc)) {
    if (/wallon|Bruxelles|bruxelles|li[eè]ge/i.test(loc)) return "fr";
    return "en";
  }

  return "en";
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

/**
 * Cheap language guess from page text (for pitch generation when no market
 * location is set). Counts common function words; defaults to English.
 */
export function outreachLangFromText(text: string | null | undefined): OutreachLang {
  const sample = (text ?? "").toLowerCase().slice(0, 4000);
  if (sample.length < 40) return "en";

  const score = (words: string[]) =>
    words.reduce((n, w) => n + (sample.match(new RegExp(`\\b${w}\\b`, "g"))?.length ?? 0), 0);

  const scores: Record<OutreachLang, number> = {
    es: score(["el", "la", "los", "las", "una", "para", "con", "por", "como", "más", "que", "gestiona"]),
    pt: score(["uma", "para", "com", "não", "você", "pelo", "pela", "está", "são"]),
    fr: score(["les", "des", "une", "pour", "avec", "dans", "est", "vous", "nous", "être"]),
    it: score(["che", "una", "per", "con", "del", "sono", "della", "degli", "nel"]),
    de: score(["der", "die", "das", "und", "den", "mit", "für", "von", "ist", "ein", "eine"]),
    pl: score(["nie", "się", "jest", "oraz", "przy", "dla", "tego", "może", "które", "który"]),
    en: score(["the", "and", "for", "with", "your", "you", "our", "that", "this", "from", "are", "we"]),
  };

  let best: OutreachLang = "en";
  let bestScore = -1;
  for (const lang of Object.keys(scores) as OutreachLang[]) {
    if (scores[lang] > bestScore) {
      best = lang;
      bestScore = scores[lang];
    }
  }
  return bestScore >= 3 ? best : "en";
}

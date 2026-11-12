/**
 * Conservative short brand name for outreach subject/greeting `{company}`.
 * If a rule is unsure, the original name is kept. Does not mutate lead.company.
 */

const LEGAL_SUFFIX =
  /(?:,?\s+(?:S\.?\s*L\.?\s*U?\.?|S\.?\s*A\.?|S\.?\s*L\.?\s*L\.?|S\.?\s*C\.?(?:P\.?)?|C\.?\s*B\.?|S\.?R\.?L\.?|srl|Ltd\.?|Limited|L\.?L\.?C\.?|GmbH|Inc\.?|Corp\.?|Co\.))$/i;

const ONLINE_SUFFIX =
  /\s+(?:Online|ON\s+LINE|E-?learning|E\s+Learning|Virtual\s+Classroom|Online\s+LMS|Online\s+Classroom)$/i;

const TAGLINE_HINT =
  /^(plateforme(\s+by)?|platforma?|recursos?|ressources?|cursos?\s+de|curso\s+de|formaci[oó]n\s+(profesional|online|a\s+distancia|en\b)|formation\s+professionnelle|online\s+learning|professional\s+learning|community|comunit[aà]|an\s+independent|focused\s+on|educnet|teleformaci[oó]n|vid[eé]olezioni|master'?s?\s+degree|knowledge\s+platform|academia\s+de\s+(?:ingl[eé]s|idiomas|formaci[oó]n)(\s+en)?|centro\s+formador|spazio\s+d|espace\s+d|piattaforma(\s+di|\s+e-?learning|\s+formazione)?|get\s+knowledge|tesol\s+and|training\s*$|salut[ei]\s+e\s+sicurezza|united\s+nations|corsi\s+(online|di|esercizi)|soluciones\s+integrales|elearning(\s+italia|\s+sicurezza)?$|area\s+formazione|admin\s*datos|aula\s+virtual|partners\s+coop|collegio\s+ingegneri|escuela\s+internacional\s+de)/i;

const BRANCH_RIGHT =
  /^(nuestra\s+se[nñ]ora|san\s+|santa\s+|santo\s+|nuestro\s+padre|virgen\s+|sagrado\s+|sagrada\s+|la\s+salle|salesianas?|medac|cesur|sek\b|puente\s+de|el\s+|la\s+|los\s+|las\s+|instituti?o\b)/i;

const ACADEMIA_DE_EN =
  /^Academia\s+de\s+(?:ingl[eé]s|idiomas|formaci[oó]n)\s+en\s+(?:(?:San|Santa|Sant|El|La|Los|Las|Castilla)\s+)?[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚáéíóúñ'.\-]+(?:\s+(?:de\s+la|de\s+los|de\s+las|del|de)\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚáéíóúñ'.\-]+)?\s+(.+)$/i;

const BRAND_THEN_ACADEMIA_DE_EN =
  /^(.+?)\s+Academia\s+de\s+(?:ingl[eé]s|idiomas|formaci[oó]n)\s+en\s+[A-ZÁÉÍÓÚÑ]/i;

const SCHOOL_OF_ENGLISH = /\s+of\s+English$/i;

const ADDRESS_AFTER_DOT =
  /\.\s+(?:Plaza|Plaça|Pza\.?|Pl\.|Calle|C\/|Ctra\.?|Carretera|Avda?\.?|Avenida|Paseo|Ps\.?|Camino|Cmno\.?|Número|N[úu]m\.?|Nº|Urbanizaci[oó]n|Urb\.)\b.*$/i;

const INSTITUTION_KEEP_PREFIX =
  /^(Escuela\s+T[eé]cnica|Escuela\s+Oficial|Colegio\s+Oficial|Colegio\s+Brit[aá]nico|Colegio\s+Estadounidense|International\s+Institute|Royal\s+College|Universidad|University|Conservatorio|Grand\s+Encampment|UNEP\b|Centro\s+de\s+Ense[nñ]anza\s+Pablo)/i;

const DESCRIPTIVE_PREFIX =
  /^(Academias?\s+de\b|Centro\s+de\s+Estudios\s+de\b|Centro\s+de\s+Ense[nñ]anza\b|Centro\s+Integral\s+de\s+Desarrollo\b|Centro\s+de\s+Formaci[oó]n\b|Plataforma\s+de\s+(Teleformaci[oó]n|formaci[oó]n)\b|Formaci[oó]n\s+Profesional\b|Instituto\s+de\s+Formaci[oó]n\s+Profesional\b|Campus\s+Virtual\s+(Centro\s+)?|Escuela\s+de\s+(?:Equitaci[oó]n|Tiempo\s+Libre|Arte|Pilotos)\b)/i;

const INSTITUTIONAL_SUFFIX =
  /^\s+(Escuela\s+Superior\s+de\b|Centro\s+de\s+Formaci[oó]n\b|Centro\s+Autorizado\b|International\s+School\b|School\s+of\b|Institute\b|Instituto\b|Academy\b|Academia\b)/i;

const SMALL_WORDS = new Set([
  "de",
  "del",
  "de la",
  "de los",
  "de las",
  "y",
  "e",
  "o",
  "u",
  "en",
  "la",
  "el",
  "las",
  "los",
  "a",
  "al",
  "the",
  "of",
  "and",
  "for",
  "to",
  "in",
  "di",
  "du",
  "des",
  "le",
  "les",
  "da",
  "do",
  "das",
  "dos",
  "by",
  "on",
  "has",
  "as",
]);

const GENERIC_HOSTS = new Set([
  "educa.madrid.org",
  "madrid.org",
  "madrid.es",
  "juntadeandalucia.es",
  "gob.es",
  "google.com",
  "wordpress.com",
  "moodle.com",
  "canvas.net",
  "blogspot.com",
  "sites.google.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "wixsite.com",
  "wordpress.org",
]);

const GENERIC_LABELS = new Set([
  "www",
  "campus",
  "aula",
  "formacion",
  "formacio",
  "elearning",
  "learn",
  "lms",
  "fad",
  "cursos",
  "aulavirtual",
  "campusvirtual",
  "moodle",
  "web",
  "mail",
  "info",
  "blog",
  "shop",
  "store",
  "edu",
  "gov",
  "calidad",
  "cours",
  "formation",
  "formations",
  "recuerdo",
  "journey",
  "virtual",
  "online",
  "e-learning",
  "aulaformacion",
  "academy",
  "comunidad",
  "madrid",
]);

const GENERIC_RESULT = new Set([
  "academia",
  "school",
  "colegio",
  "centro",
  "online",
  "campus",
  "aula",
  "formation",
  "formations",
  "formacion",
  "formación",
  "cours",
  "calidad",
  "e learning",
  "e-learning",
  "of english",
  "institute",
  "instituto",
  "san juan",
  "aula virtual",
  "campus virtual",
  "formaciones",
  "academy",
  "escuela",
  "comunidad",
  "area",
  "secretarios",
  "elearning",
  "formations en",
  "bk",
  "international",
  "global",
  "national",
  "virtual",
  "professional",
  "community",
  "coaching",
  "official",
  "special",
]);

const BAD_REMAINDER_END =
  /(?:\s+(?:en|de|del|la|el|y|the|of|and|for|di|du)|\s+-\s+(?:Cursos|Campus|Plataforma(\s+formaci[oó]n)?|Formador))$/i;

const PUBLIC_SUFFIXES = new Set([
  "com",
  "org",
  "net",
  "info",
  "biz",
  "edu",
  "gov",
  "int",
  "mil",
  "es",
  "fr",
  "it",
  "uk",
  "de",
  "pt",
  "cat",
  "gal",
  "eus",
  "eu",
  "io",
  "co",
  "us",
  "uk.com",
  "co.uk",
  "ac.uk",
  "gov.uk",
  "org.uk",
  "com.es",
  "org.es",
  "edu.es",
  "gob.es",
  "ac.es",
  "madrid",
  "barcelona",
  "online",
  "site",
  "app",
  "dev",
]);

const SCHOOL_EXTEND = new Set([
  "school",
  "academia",
  "college",
  "colegio",
  "institute",
  "instituto",
  "academy",
  "formación",
  "formacion",
]);

const NOT_ACRONYM = new Set(["ego", "has", "site", "line", "moodle"]);

function letters(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "");
}

function isGeneric(name: string): boolean {
  const t = name.trim();
  return t.length < 3 || GENERIC_RESULT.has(t.toLowerCase());
}

function hostOf(website?: string | null): string {
  if (!website?.trim()) return "";
  let w = website.trim();
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  try {
    return (new URL(w).hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function domainLabel(website?: string | null): string {
  const host = hostOf(website);
  if (!host) return "";
  let parts = host.split(".");
  while (
    parts.length >= 2 &&
    (PUBLIC_SUFFIXES.has(parts.slice(-2).join(".")) ||
      PUBLIC_SUFFIXES.has(parts[parts.length - 1]!))
  ) {
    if (PUBLIC_SUFFIXES.has(parts.slice(-2).join("."))) {
      parts = parts.slice(0, -2);
    } else {
      parts = parts.slice(0, -1);
    }
  }
  return parts[parts.length - 1] ?? "";
}

function titleLongAllCaps(name: string): string {
  if (!name || name !== name.toUpperCase()) return name;
  if ((name.match(/-/g) ?? []).length >= 3) return name;
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length < 2) return name;
  const parts = name.split(/(\s+|-)/);
  let first = true;
  return parts
    .map((w) => {
      if (!w || /^\s+$/.test(w) || w === "-") return w;
      const low = w.toLowerCase();
      const bare = w.replace(/\./g, "");
      const keepAcronym =
        bare.length >= 2 &&
        bare.length <= 4 &&
        w === w.toUpperCase() &&
        /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/.test(bare) &&
        !SMALL_WORDS.has(low) &&
        !NOT_ACRONYM.has(low);
      let out: string;
      if (keepAcronym) out = w;
      else if (!first && SMALL_WORDS.has(low)) out = low;
      else out = w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w;
      first = false;
      return out;
    })
    .join("");
}

function stripLegalAndOnline(name: string): string {
  let cur = name.trim();
  for (let i = 0; i < 6; i++) {
    const nxt = cur
      .replace(LEGAL_SUFFIX, "")
      .trim()
      .replace(/,$/, "")
      .trim()
      .replace(ONLINE_SUFFIX, "")
      .trim();
    if (nxt === cur) break;
    if (isGeneric(nxt) || BAD_REMAINDER_END.test(nxt)) break;
    cur = nxt;
  }
  return cur;
}

function splitTagline(name: string): string {
  const seps = [" — ", " – ", " - ", " | ", " -"] as const;
  for (const sep of seps) {
    if (!name.includes(sep)) continue;
    const i = name.indexOf(sep);
    const left = name.slice(0, i).trim();
    const right = name.slice(i + sep.length).trim();
    if (!left || !right || isGeneric(left)) continue;
    if (BRANCH_RIGHT.test(right) && !TAGLINE_HINT.test(right)) continue;
    if (TAGLINE_HINT.test(right) || (right.length >= 50 && /^[a-zàá]/.test(right))) {
      return left;
    }
    if (/^[a-zàá]/.test(right) && right.length > 28) return left;
  }
  if (name.includes("-") && !name.includes(" -") && !name.includes("- ")) {
    const i = name.indexOf("-");
    const left = name.slice(0, i).trim();
    const right = name.slice(i + 1).trim();
    if (left && right && !isGeneric(left) && TAGLINE_HINT.test(right)) return left;
  }
  return name;
}

function academiaDeEn(name: string): string {
  const m = name.match(ACADEMIA_DE_EN);
  if (m?.[1] && !isGeneric(m[1].trim())) return m[1].trim();
  const b = name.match(BRAND_THEN_ACADEMIA_DE_EN);
  if (b?.[1]) {
    const rest = b[1].trim();
    if (!isGeneric(rest) && rest.toLowerCase() !== "la academia") return rest;
  }
  return name;
}

function schoolOfEnglish(name: string): string {
  if (!SCHOOL_OF_ENGLISH.test(name)) return name;
  const short = name.replace(SCHOOL_OF_ENGLISH, "").trim();
  return isGeneric(short) ? name : short;
}

function stripAddress(name: string): string {
  if (!ADDRESS_AFTER_DOT.test(name)) return name;
  const cut = name.replace(ADDRESS_AFTER_DOT, "").trim().replace(/\.$/, "");
  if (!isGeneric(cut) && cut.length >= 8) return cut;
  return name;
}

function findDomainPhrase(name: string, label: string): string | null {
  const words = name.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9']+/g);
  if (!words) return null;
  const ll = letters(label);
  let best: { phrase: string; atStart: boolean; atEnd: boolean; i: number; k: number } | null =
    null;
  for (let i = 0; i < words.length; i++) {
    for (let j = i; j < Math.min(i + 4, words.length); j++) {
      const phrase0 = words.slice(i, j + 1).join(" ");
      const pl = letters(phrase0);
      if (!pl) continue;
      const [longer, shorter] = pl.length >= ll.length ? [pl, ll] : [ll, pl];
      const almostEq =
        pl === ll ||
        (Boolean(shorter) &&
          longer.startsWith(shorter) &&
          shorter.length >= 5 &&
          longer.length - shorter.length <= 3);
      if (!almostEq) continue;
      let k = j;
      if (k + 1 < words.length && SCHOOL_EXTEND.has(words[k + 1]!.toLowerCase())) {
        k += 1;
      }
      const phrase = words.slice(i, k + 1).join(" ");
      const atStart = i === 0;
      const atEnd = k === words.length - 1;
      if (!atStart && !atEnd) continue;
      if (!best || letters(phrase).length < letters(best.phrase).length) {
        best = { phrase, atStart, atEnd, i, k };
      }
      break;
    }
  }
  if (!best) return null;
  if (isGeneric(best.phrase) || best.phrase.length <= 3) return null;
  if (best.atEnd && best.i > 0) {
    const prefix = words.slice(0, best.i).join(" ");
    if (!DESCRIPTIVE_PREFIX.test(prefix) || prefix.length < 10) return null;
    return best.phrase;
  }
  if (best.atStart && best.k < words.length - 1) {
    const suffix = " " + words.slice(best.k + 1).join(" ");
    if (!INSTITUTIONAL_SUFFIX.test(suffix)) return null;
    return best.phrase;
  }
  return null;
}

function domainHint(name: string, website?: string | null): string | null {
  if (INSTITUTION_KEEP_PREFIX.test(name)) return null;
  if (name.length < 40) return null;
  const host = hostOf(website);
  if (
    !host ||
    GENERIC_HOSTS.has(host) ||
    [...GENERIC_HOSTS].some((g) => host === g || host.endsWith(`.${g}`))
  ) {
    return null;
  }
  const label = domainLabel(website);
  if (!label || GENERIC_LABELS.has(label) || label.length < 5) return null;
  if (!letters(name).includes(letters(label))) return null;
  const phrase = findDomainPhrase(name, label);
  if (!phrase) return null;
  if (phrase.length >= name.length * 0.8) return null;
  return phrase;
}

/** Short brand for subject/greeting. Returns the original name when unsure. */
export function displayCompanyName(
  company: string,
  website?: string | null,
): string {
  const original = (company ?? "").trim();
  if (!original) return original;
  let name = original;
  name = stripAddress(name);
  name = splitTagline(name);
  name = academiaDeEn(name);
  name = schoolOfEnglish(name);
  name = stripLegalAndOnline(name);
  const hinted = domainHint(name, website);
  if (hinted) name = schoolOfEnglish(hinted);
  name = name.replace(/^[\s\-,|]+|[\s\-,|]+$/g, "").replace(/\s{2,}/g, " ").trim();
  name = titleLongAllCaps(name);
  if (isGeneric(name) || BAD_REMAINDER_END.test(name)) return original;
  const ol = letters(original);
  const nl = letters(name);
  if (!ol.includes(nl) && !nl.includes(ol)) return original;
  return name;
}

/** Replace the company token in an AKADEMO subject + «Buenas …!» greeting only. */
export function rewriteSubjectAndGreeting(
  subject: string,
  body: string,
  originalCompany: string,
  cleanedCompany: string,
): { subject: string; body: string } | null {
  const original = originalCompany.trim();
  const cleaned = cleanedCompany.trim();
  if (!original || original === cleaned) return null;
  if (!subject.includes(original) && !body.includes(original)) return null;
  const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const newSubject = subject.includes(original)
    ? subject.replace(original, cleaned)
    : subject;
  const greet = new RegExp(`(Buenas)(?:\\s|\u00a0)+${escaped}!`);
  const newBody = greet.test(body)
    ? body.replace(greet, `$1\u00a0${cleaned}!`)
    : body;
  if (newSubject === subject && newBody === body) return null;
  return { subject: newSubject, body: newBody };
}

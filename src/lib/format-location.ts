/** Short city / country (or city / region) for cards and tables. Street, floor, and venue stay in the drawer. */

const COUNTRY_RE =
  /^(spain|españa|france|italy|italia|germany|deutschland|portugal|united\s+kingdom|uk|england|scotland|wales|ireland|united\s+states|usa|u\.s\.a?\.?|mexico|méxico|andorra|switzerland|suiza|belgium|netherlands|austria|poland|sweden|norway|denmark|finland|greece|turkey|morocco|brazil|brasil|argentina|chile|colombia|peru|perú|canada|australia|japan|china|india)$/i;

const US_STATE_RE = /^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/;

const FLOOR_PART_RE =
  /^(?:\d+\s*(?:er|r|n|t|th|st|nd|º|°)?\s*)?(?:pis|piso|planta|floor|étage|etage|entres[oò]l|entresuelo|àtic|atic|baixos|local|apt|apartment|suite|door)\b/i;

const FLOOR_PREFIX_RE =
  /^(?:\d+\s*(?:er|r|n|t|th|st|nd|º|°)?\s*)?(?:pis|piso|planta|floor|étage|etage)\s+/i;

const STREET_RE =
  /^(?:\d+\s+)?(?:carrer|calle|c\/|av(?:da)?\.?|avenida|passeig|paseo|plaza|plaça|rue|via|strada|road|street|st\.|blvd|camino|ronda|travessera|rambla|pg\.|c\.)\b/i;

const VENUE_RE =
  /^(?:centro|centre|cl[ií]nica|clinic|hospital|farmacia|pharmacy|institut(?:o|e)?|medical|m[eé]dic[oa]|universit)/i;

const HOUSE_NUMBER_RE = /^\d{1,4}[A-Za-z]?$/;
const POSTAL_ONLY_RE = /^\d{4,6}(?:-\d{4})?$/;
const OFFICE_PART_RE =
  /^(?:despatx|despacho|consultori|consultorio|office|room|sala|box|unit)\b/i;
/** Leftover after stripping "Planta 0.)" / "(despatx 128". */
const FLOOR_FRAGMENT_RE = /^\d+[.)\]]*$/;

function stripPostal(s: string): string {
  return s
    // "12 08022 Barcelona" — door number glued to postal + city (no comma).
    .replace(/^\d{1,4}[A-Za-z]?\s+(?=\d{4,6}\b)/, "")
    .replace(/^\d{4,6}(?:-\d{4})?\s+/, "")
    .replace(/\s+\d{4,6}(?:-\d{4})?$/, "")
    .trim();
}

function cleanPart(s: string): string {
  return stripPostal(s.replace(/\s+/g, " ").trim())
    .replace(FLOOR_PREFIX_RE, "")
    .trim();
}

function isCountry(s: string): boolean {
  return COUNTRY_RE.test(s);
}

function isUsState(s: string): boolean {
  return US_STATE_RE.test(s);
}

function isFloorOnly(s: string): boolean {
  return FLOOR_PART_RE.test(s) && FLOOR_PREFIX_RE.test(`${s} `);
}

function isHouseNumber(s: string): boolean {
  return HOUSE_NUMBER_RE.test(s);
}

function isNonGeo(s: string): boolean {
  if (!s) return true;
  if (isHouseNumber(s) || POSTAL_ONLY_RE.test(s)) return true;
  if (isFloorOnly(s) || FLOOR_FRAGMENT_RE.test(s)) return true;
  if (OFFICE_PART_RE.test(s)) return true;
  if (STREET_RE.test(s)) return true;
  if (VENUE_RE.test(s) && s.split(/\s+/).length >= 2) return true;
  return false;
}

/** Drop office/floor asides so they never become the "city". */
function stripParentheticals(s: string): string {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\([^)]*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countryLabel(s: string): string {
  if (isUsState(s)) return s.split(/\s+/)[0] ?? s;
  const t = s.trim();
  if (/^españa$/i.test(t)) return "Spain";
  if (/^usa$|^u\.s\.a?\.?$/i.test(t)) return "USA";
  if (/^uk$|^united\s+kingdom$/i.test(t)) return "UK";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

function explodePart(raw: string): string[] {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  // Split before a postal so "12 08022 Barcelona" becomes door + city.
  return trimmed
    .split(/\s+(?=\d{4,6}(?:-\d{4})?(?:\s+|$))/)
    .map((p) => cleanPart(p))
    .filter(Boolean);
}

export function shortLocation(location: string | null | undefined): string | null {
  if (!location?.trim()) return null;
  const parts = stripParentheticals(location)
    .split(",")
    .flatMap(explodePart)
    .filter(Boolean);
  const geo = parts.filter((p) => !isNonGeo(p));
  const pool = geo.length > 0 ? geo : parts.map(cleanPart).filter((p) => p && !isNonGeo(p));
  if (pool.length === 0) {
    const fallback = cleanPart(stripParentheticals(location).replace(/,/g, " "));
    if (!fallback || isNonGeo(fallback) || VENUE_RE.test(fallback)) return null;
    return fallback;
  }
  const last = pool[pool.length - 1] ?? "";
  const prev = pool.length >= 2 ? pool[pool.length - 2] : "";
  if (isCountry(last) || isUsState(last)) {
    if (prev && !isCountry(prev) && !isUsState(prev)) {
      return `${prev}, ${countryLabel(last)}`;
    }
    return countryLabel(last);
  }
  return last;
}

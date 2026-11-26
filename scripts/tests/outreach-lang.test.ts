/**
 * Lead language detection (TLD / phone / Spain-France-rest routing),
 * Search auto-draft per-language lookup, and the send-time mismatch guard.
 *
 * Run: npx esbuild scripts/tests/outreach-lang.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/outreach-lang.test.mjs && node /tmp/outreach-lang.test.mjs
 */
import assert from "node:assert/strict";
import {
  outreachLangEvidenceForLead,
  outreachLangForLead,
  outreachLangFromLocation,
  outreachLangFromText,
  outreachLangMismatchIssue,
  type LeadLangInput,
} from "@/lib/outreach/locale";
import {
  AKADEMO_PROFILE_ID,
  draftCopyForLead,
  pitchForLang,
  profileLangRouting,
  resolveDraftLang,
  subjectForLang,
  type OutreachProfile,
} from "@/lib/sender-profile";

function lead(partial: LeadLangInput): LeadLangInput {
  return {
    location: null,
    website: null,
    emails: [],
    phones: [],
    ...partial,
  };
}

const profile = (
  partial: Partial<OutreachProfile> & Pick<OutreachProfile, "id">,
): OutreachProfile =>
  ({
    name: "Test",
    displayName: "Test",
    company: "Test",
    title: "",
    website: "",
    signature: "Sign",
    subjectTemplate: "",
    subjects: {},
    pitches: {},
    aiPersonalize: false,
    ...partial,
  }) as OutreachProfile;

// --- location (existing behaviour, still default routing) ---
assert.equal(outreachLangFromLocation("Barcelona, Spain"), "es");
assert.equal(outreachLangFromLocation("Paris, France"), "fr");
assert.equal(outreachLangFromLocation("London, UK"), "en");
assert.equal(outreachLangFromLocation("Milan, Italy"), "it");
assert.equal(outreachLangFromLocation("Mexico City"), "es");
assert.equal(outreachLangFromLocation(""), "en");
assert.equal(outreachLangFromLocation(null), "en");
assert.equal(outreachLangFromLocation("Calle Mayor 12"), "en");

// --- TLD fallback when location is blank / unrecognized ---
assert.equal(
  outreachLangForLead(lead({ website: "https://www.academia.es/contacto" })),
  "es",
);
assert.equal(outreachLangForLead(lead({ website: "https://school.fr" })), "fr");
assert.equal(outreachLangForLead(lead({ website: "https://www.clinic.it" })), "it");
assert.equal(outreachLangForLead(lead({ website: "https://firm.co.uk/about" })), "en");
assert.equal(outreachLangForLead(lead({ website: "https://shop.uk" })), "en");
assert.equal(outreachLangForLead(lead({ website: "https://acme.com" })), "en");
assert.equal(
  outreachLangEvidenceForLead(lead({ website: "https://acme.com" })).confident,
  false,
  "generic .com must not count as a confident country",
);
assert.equal(
  outreachLangEvidenceForLead(lead({ website: "https://acme.org" })).confident,
  false,
);
assert.equal(
  outreachLangForLead(lead({ emails: ["hello@campus.es"] })),
  "es",
);
assert.equal(
  outreachLangForLead(lead({ emails: ["hello@campus.com"] })),
  "en",
);
assert.equal(
  outreachLangEvidenceForLead(lead({ emails: ["hello@campus.com"] })).confident,
  false,
);

// Location wins over a conflicting TLD.
assert.equal(
  outreachLangForLead(
    lead({ location: "London, UK", website: "https://brand.es" }),
  ),
  "en",
);

// --- phone country code fallback ---
assert.equal(outreachLangForLead(lead({ phones: ["+34 612 345 678"] })), "es");
assert.equal(outreachLangForLead(lead({ phones: ["0033 1 23 45 67 89"] })), "fr");
assert.equal(outreachLangForLead(lead({ phones: ["+44 20 7946 0958"] })), "en");
assert.equal(outreachLangForLead(lead({ phones: ["+1 415-555-0100"] })), "en");
assert.equal(outreachLangForLead(lead({ phones: ["+39 02 1234 5678"] })), "it");
assert.equal(outreachLangForLead(lead({ phones: ["+351 21 123 4567"] })), "pt");
// Local Spanish mobile without a country code: do not guess.
assert.equal(
  outreachLangEvidenceForLead(lead({ phones: ["612 345 678"] })).confident,
  false,
);

// TLD wins over phone when location is blank (documented order).
assert.equal(
  outreachLangForLead(
    lead({ website: "https://school.fr", phones: ["+34 600 000 000"] }),
  ),
  "fr",
);

// --- default vs Spain/France/else-en routing ---
const mexico = lead({ location: "Guadalajara, Mexico" });
const spain = lead({ location: "Zaragoza, Spain" });
const france = lead({ location: "Lyon, France" });
const italy = lead({ location: "Rome, Italy" });
const uk = lead({ location: "Manchester, UK" });
const us = lead({ location: "Austin, TX, United States" });
const blank = lead({});

assert.equal(outreachLangForLead(mexico, "default"), "es");
assert.equal(outreachLangForLead(spain, "default"), "es");
assert.equal(outreachLangForLead(france, "default"), "fr");
assert.equal(outreachLangForLead(italy, "default"), "it");

const strict = "spainEsFranceFrElseEn" as const;
assert.equal(outreachLangForLead(spain, strict), "es");
assert.equal(outreachLangForLead(lead({ website: "https://aula.es" }), strict), "es");
assert.equal(outreachLangForLead(lead({ phones: ["+34 600 111 222"] }), strict), "es");
assert.equal(outreachLangForLead(france, strict), "fr");
assert.equal(outreachLangForLead(lead({ website: "https://ecole.fr" }), strict), "fr");
assert.equal(outreachLangForLead(lead({ phones: ["+33 1 40 00 00 00"] }), strict), "fr");
assert.equal(outreachLangForLead(mexico, strict), "en", "LatAm is English under AKADEMO routing");
assert.equal(outreachLangForLead(italy, strict), "en");
assert.equal(outreachLangForLead(uk, strict), "en");
assert.equal(outreachLangForLead(us, strict), "en");
assert.equal(outreachLangForLead(lead({ website: "https://studio.it" }), strict), "en");
assert.equal(outreachLangForLead(blank, strict), "en");
assert.equal(
  outreachLangEvidenceForLead(blank, strict).confident,
  false,
  "blank lead stays unconfident even under strict routing",
);

assert.equal(profileLangRouting({ id: AKADEMO_PROFILE_ID }), strict);
assert.equal(profileLangRouting({ id: "op_imztg7md" }), "default");
assert.equal(
  profileLangRouting({ id: "op_other", langRouting: strict }),
  strict,
);

// --- pitch / subject fallback: never use es when en exists ---
const bilingual = profile({
  id: "op_bi",
  pitches: {
    es: "Pitch en español para {company}",
    en: "English pitch for {company}",
    fr: "Pitch français pour {company}",
  },
  subjects: {
    es: "Propuesta para {company}",
    en: "A note for {company}",
    fr: "Petit message pour {company}",
  },
});
assert.equal(pitchForLang(bilingual, "es"), "Pitch en español para {company}");
assert.equal(pitchForLang(bilingual, "en"), "English pitch for {company}");
assert.equal(
  pitchForLang(bilingual, "it"),
  "English pitch for {company}",
  "missing language falls back to en, not es",
);
assert.equal(subjectForLang(bilingual, "it"), "A note for {company}");

const esOnly = profile({
  id: "op_es",
  pitches: { es: "Solo español para {company}" },
  subjects: { es: "Propuesta para {company}" },
  subjectTemplate: "Propuesta para {company}",
});
assert.equal(
  pitchForLang(esOnly, "en"),
  "Solo español para {company}",
  "es-only profile can still return the Spanish pitch",
);

// resolveDraftLang: Spain/France/else + fallback to en when present
assert.equal(resolveDraftLang(bilingual, spain), "es");
assert.equal(resolveDraftLang(bilingual, france), "fr");
assert.equal(resolveDraftLang(bilingual, uk), "en");
assert.equal(resolveDraftLang(bilingual, italy), "en");

const akademoLike = profile({
  id: AKADEMO_PROFILE_ID,
  pitches: bilingual.pitches,
  subjects: bilingual.subjects,
});
assert.equal(resolveDraftLang(akademoLike, mexico), "en");
assert.equal(resolveDraftLang(akademoLike, spain), "es");
assert.equal(resolveDraftLang(akademoLike, france), "fr");
assert.equal(resolveDraftLang(akademoLike, italy), "en");

const akademoEsOnly = profile({
  id: AKADEMO_PROFILE_ID,
  pitches: { es: "Buenas {company}! Pitch AKADEMO." },
  subjects: { es: "Propuesta para {company}" },
});
assert.equal(
  resolveDraftLang(akademoEsOnly, uk),
  "es",
  "until an English template exists, AKADEMO still resolves to the only pitch",
);

// LUMIA-style: Spanish copy stored under the en key, Spanish pharmacy.
const lumiaLike = profile({
  id: "op_imztg7md",
  pitches: { en: "Os contacto desde LUMIA para {company}." },
  subjects: { en: "Propuesta para {company}" },
  subjectTemplate: "Propuesta para {company}",
});
assert.equal(resolveDraftLang(lumiaLike, spain), "en");
assert.equal(pitchForLang(lumiaLike, "es"), "Os contacto desde LUMIA para {company}.");

// --- Search auto-draft per-lead lookup ---
const spainCopy = draftCopyForLead(akademoLike, {
  location: "Valencia, Spain",
  company: "Academia Lope de Vega",
} as LeadLangInput);
assert.equal(spainCopy.lang, "es");
assert.match(spainCopy.offerNotes, /español/);
assert.match(spainCopy.subjectTemplate, /Propuesta/);

const franceCopy = draftCopyForLead(akademoLike, {
  location: "Nice, France",
  website: "https://ecole.fr",
});
assert.equal(franceCopy.lang, "fr");
assert.match(franceCopy.offerNotes, /français/);
assert.match(franceCopy.subjectTemplate, /Petit message/);

const ukCopy = draftCopyForLead(akademoLike, {
  location: "London, UK",
  emails: ["hello@school.co.uk"],
});
assert.equal(ukCopy.lang, "en");
assert.match(ukCopy.offerNotes, /English pitch/);
assert.match(ukCopy.subjectTemplate, /A note for/);

const italyTldCopy = draftCopyForLead(akademoLike, {
  website: "https://scuola.it",
});
assert.equal(italyTldCopy.lang, "en", "Italian TLD is English under AKADEMO routing");
assert.match(italyTldCopy.offerNotes, /English pitch/);

const usPhoneCopy = draftCopyForLead(akademoLike, {
  phones: ["+1 212-555-0100"],
});
assert.equal(usPhoneCopy.lang, "en");

// A profile with only Spanish still returns that Spanish copy for a UK lead
// (the send-time guard blocks the send; we do not invent an English pitch).
const esOnlyCopy = draftCopyForLead(akademoEsOnly, uk);
assert.equal(esOnlyCopy.lang, "es");
assert.match(esOnlyCopy.offerNotes, /AKADEMO/);

// --- send-time mismatch guard ---
const spanishDraft = {
  subject: "Propuesta para Callan School",
  body: "<p>Buenas Callan School!</p><p>Me pongo en contacto porque muchas academias online.</p>",
};
const englishDraft = {
  subject: "A note for Callan School",
  body: "<p>I work with schools like yours and wanted to get in touch.</p>",
};
const frenchDraft = {
  subject: "Petit message pour École Lyon",
  body: "<p>Bonjour, nous travaillons avec des centres comme le vôtre, sans engagement.</p>",
};

assert.match(
  outreachLangMismatchIssue(spanishDraft, uk, { routing: strict }) ?? "",
  /looks Spanish.*English contact/i,
);
assert.match(
  outreachLangMismatchIssue(spanishDraft, italy, { routing: "default" }) ?? "",
  /looks Spanish.*Italian contact/i,
);
assert.match(
  outreachLangMismatchIssue(spanishDraft, france, { routing: strict }) ?? "",
  /looks Spanish.*French contact/i,
);
assert.match(
  outreachLangMismatchIssue(spanishDraft, us, { routing: "default" }) ?? "",
  /looks Spanish.*English contact/i,
);
assert.equal(
  outreachLangMismatchIssue(spanishDraft, spain, { routing: strict }),
  null,
  "Spanish draft to a Spain lead is fine",
);
assert.equal(
  outreachLangMismatchIssue(spanishDraft, lead({ location: "Madrid" }), {
    routing: "default",
  }),
  null,
);
assert.equal(
  outreachLangMismatchIssue(spanishDraft, blank, { routing: strict }),
  null,
  "do not block when location/TLD/phone are unknown",
);
assert.equal(
  outreachLangMismatchIssue(spanishDraft, lead({ website: "https://farmacia.com" }), {
    routing: "default",
  }),
  null,
  "generic .com + Spanish draft must not false-positive (LUMIA pharmacies)",
);
assert.equal(
  outreachLangMismatchIssue(spanishDraft, lead({ location: "Calle Mayor 12" }), {
    routing: "default",
  }),
  null,
  "unrecognized Spanish street address must not false-positive",
);
assert.equal(
  outreachLangMismatchIssue(englishDraft, uk, { routing: strict }),
  null,
);
assert.equal(
  outreachLangMismatchIssue(frenchDraft, france, { routing: strict }),
  null,
);
assert.match(
  outreachLangMismatchIssue(englishDraft, spain, { routing: strict }) ?? "",
  /looks English.*Spanish contact/i,
);
assert.equal(
  outreachLangMismatchIssue(
    { subject: "Hi", body: "Ok" },
    uk,
    { routing: strict },
  ),
  null,
  "short / ambiguous drafts must not false-positive",
);
assert.ok(outreachLangFromText(spanishDraft.subject + " " + spanishDraft.body) === "es");
assert.ok(outreachLangFromText(englishDraft.subject + " " + englishDraft.body) === "en");
assert.ok(outreachLangFromText(frenchDraft.subject + " " + frenchDraft.body) === "fr");

console.log("outreach-lang.test.ts ok");

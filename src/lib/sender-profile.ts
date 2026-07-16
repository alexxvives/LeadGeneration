/**
 * Client-side outreach profiles (voice + pitch versions by language).
 * Non-secret only — SMTP keys stay in .env (constitution Art. III.5).
 */
import { readMigratedKey } from "@/lib/browser-storage";
import {
  outreachLangFromText,
  type OutreachLang,
} from "@/lib/outreach/locale";

const KEY = "leadify_sender_profiles";
const LEGACY_SINGLE = "leadify_sender_profile";
const LEGACY_KEYS = ["lodestar_sender_profile"];

export type OutreachProfile = {
  id: string;
  name: string;
  displayName: string;
  company: string;
  title: string;
  /** Kept for backward-compat / AI generate website hint. */
  website: string;
  signature: string;
  subjectTemplate: string;
  /**
   * Sales pitch versions by language. Same offer, different language —
   * preview and drafting pick the matching version (no sample substitution).
   * May contain light HTML (bold / lists) from the Settings editor.
   */
  pitches: Partial<Record<OutreachLang, string>>;
  /**
   * When true, drafts use greeting + sales pitch + sign-off only
   * (no scraped opener / stock CTA). Default false = assembled template.
   */
  staticBody?: boolean;
};

export type SenderProfile = OutreachProfile;

type ProfileStore = {
  profiles: OutreachProfile[];
  activeId: string | null;
};

/** Default sign-off shown as placeholder + empty-state resolve target. */
export const SIGNATURE_PLACEHOLDER = [
  "Alexandre Vives",
  "Co-founder & CEO | AKADEMO",
  "www.akademo-edu.com",
].join("\n");

export const DEFAULT_COMPANY = "AKADEMO";

/** Common titles for the optional role dropdown (custom still allowed). */
export const TITLE_OPTIONS = [
  "Founder",
  "Co-founder",
  "Co-founder & CEO",
  "CEO",
  "CTO",
  "COO",
  "Head of Growth",
  "Head of Sales",
  "Marketing Director",
  "Account Executive",
  "Partner",
  "Consultant",
] as const;

function newId(): string {
  return `op_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyProfile(partial?: Partial<OutreachProfile>): OutreachProfile {
  return {
    id: partial?.id ?? newId(),
    name: partial?.name ?? "Default",
    displayName: partial?.displayName ?? "",
    company: partial?.company ?? DEFAULT_COMPANY,
    title: partial?.title ?? "",
    website: partial?.website ?? "",
    signature: partial?.signature ?? "",
    subjectTemplate: partial?.subjectTemplate ?? "",
    pitches: partial?.pitches ?? {},
    staticBody: partial?.staticBody ?? false,
  };
}

/** Build a 2–3 line sign-off from profile fields. */
export function buildSignature(
  p: Pick<OutreachProfile, "displayName" | "title" | "company" | "website">,
): string {
  const lines: string[] = [];
  const name = p.displayName.trim();
  if (name) lines.push(name);
  const role = [p.title.trim(), p.company.trim()].filter(Boolean).join(" | ");
  if (role) lines.push(role);
  const site = p.website.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (site) lines.push(site);
  return lines.join("\n");
}

/** Prefer saved signature; otherwise build from fields; else placeholder. */
export function resolveSignature(p: OutreachProfile): string {
  const saved = p.signature.trim();
  if (saved) return saved;
  const built = buildSignature(p);
  return built || SIGNATURE_PLACEHOLDER;
}

/** Pitch for a language; falls back to any other version, then empty. */
export function pitchForLang(
  p: OutreachProfile,
  lang: OutreachLang,
): string {
  const exact = p.pitches[lang]?.trim();
  if (exact) return exact;
  for (const v of Object.values(p.pitches)) {
    if (v?.trim()) return v.trim();
  }
  return "";
}

/** Primary pitch language (first non-empty, preferring detected). */
export function primaryPitchLang(p: OutreachProfile): OutreachLang | null {
  const entries = (Object.entries(p.pitches) as [OutreachLang, string][]).filter(
    ([, t]) => t.trim(),
  );
  if (entries.length === 0) return null;
  const detected = outreachLangFromText(entries[0]![1]);
  if (p.pitches[detected]?.trim()) return detected;
  return entries[0]![0];
}

function migrateLegacySingle(raw: string): ProfileStore {
  try {
    const parsed = JSON.parse(raw) as Partial<OutreachProfile> & {
      defaultOffer?: string;
    };
    const offer = String(parsed.defaultOffer ?? "").trim();
    const pitches: Partial<Record<OutreachLang, string>> = {
      ...(parsed.pitches ?? {}),
    };
    if (offer && Object.keys(pitches).length === 0) {
      pitches[outreachLangFromText(offer)] = offer;
    }
    const profile = emptyProfile({
      id: parsed.id,
      name: String(parsed.name ?? "Default"),
      displayName: String(parsed.displayName ?? ""),
      company: String(parsed.company ?? DEFAULT_COMPANY) || DEFAULT_COMPANY,
      title: String(parsed.title ?? ""),
      website: String(parsed.website ?? ""),
      signature: String(parsed.signature ?? ""),
      subjectTemplate: String(parsed.subjectTemplate ?? ""),
      pitches,
      staticBody: Boolean(parsed.staticBody),
    });
    return { profiles: [profile], activeId: profile.id };
  } catch {
    return { profiles: [emptyProfile()], activeId: null };
  }
}

function readStore(): ProfileStore {
  if (typeof window === "undefined") {
    return { profiles: [], activeId: null };
  }
  try {
    const multi = localStorage.getItem(KEY);
    if (multi) {
      const parsed = JSON.parse(multi) as ProfileStore;
      const profiles = Array.isArray(parsed.profiles)
        ? parsed.profiles.map((p) => normalizeProfile(p))
        : [];
      if (profiles.length === 0) {
        const fresh = emptyProfile();
        return { profiles: [fresh], activeId: fresh.id };
      }
      const activeId =
        parsed.activeId && profiles.some((p) => p.id === parsed.activeId)
          ? parsed.activeId
          : profiles[0]!.id;
      return { profiles, activeId };
    }

    const legacy = readMigratedKey(LEGACY_SINGLE, LEGACY_KEYS);
    if (legacy) {
      const store = migrateLegacySingle(legacy);
      writeStore(store);
      return store;
    }
  } catch {
    /* fall through */
  }
  const fresh = emptyProfile();
  return { profiles: [fresh], activeId: fresh.id };
}

function normalizeProfile(p: Partial<OutreachProfile> & { defaultOffer?: string }): OutreachProfile {
  const pitches: Partial<Record<OutreachLang, string>> = { ...(p.pitches ?? {}) };
  const legacyOffer = String(p.defaultOffer ?? "").trim();
  if (legacyOffer && Object.values(pitches).every((t) => !t?.trim())) {
    pitches[outreachLangFromText(legacyOffer)] = legacyOffer;
  }
  return emptyProfile({
    id: p.id,
    name: String(p.name ?? "Untitled"),
    displayName: String(p.displayName ?? ""),
    company: String(p.company ?? DEFAULT_COMPANY) || DEFAULT_COMPANY,
    title: String(p.title ?? ""),
    website: String(p.website ?? ""),
    signature: String(p.signature ?? ""),
    subjectTemplate: String(p.subjectTemplate ?? ""),
    pitches,
    staticBody: Boolean(p.staticBody),
  });
}

function writeStore(store: ProfileStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

/** Active profile (or a fresh empty one). */
export function loadSenderProfile(): OutreachProfile {
  const store = readStore();
  const active =
    store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
  if (active) return active;
  return emptyProfile();
}

export function loadOutreachProfiles(): {
  profiles: OutreachProfile[];
  activeId: string | null;
} {
  return readStore();
}

export function saveOutreachProfiles(
  profiles: OutreachProfile[],
  activeId: string | null,
): void {
  const safe =
    profiles.length > 0 ? profiles : [emptyProfile({ name: "Default" })];
  const id =
    activeId && safe.some((p) => p.id === activeId) ? activeId : safe[0]!.id;
  writeStore({ profiles: safe, activeId: id });
}

/** Persist the active profile (updates matching id in the list). */
export function saveSenderProfile(profile: OutreachProfile): void {
  const store = readStore();
  const idx = store.profiles.findIndex((p) => p.id === profile.id);
  const profiles =
    idx >= 0
      ? store.profiles.map((p, i) => (i === idx ? profile : p))
      : [...store.profiles, profile];
  writeStore({
    profiles,
    activeId: profile.id,
  });
}

export function setActiveOutreachProfile(id: string): void {
  const store = readStore();
  if (!store.profiles.some((p) => p.id === id)) return;
  writeStore({ ...store, activeId: id });
}

export function createOutreachProfile(name?: string): OutreachProfile {
  const store = readStore();
  const profile = emptyProfile({
    name: name?.trim() || `Profile ${store.profiles.length + 1}`,
  });
  writeStore({
    profiles: [...store.profiles, profile],
    activeId: profile.id,
  });
  return profile;
}

export function deleteOutreachProfile(id: string): void {
  const store = readStore();
  const profiles = store.profiles.filter((p) => p.id !== id);
  if (profiles.length === 0) {
    const fresh = emptyProfile();
    writeStore({ profiles: [fresh], activeId: fresh.id });
    return;
  }
  const activeId =
    store.activeId === id ? profiles[0]!.id : store.activeId;
  writeStore({ profiles, activeId });
}

/** Compat getter — primary pitch text (any language). */
export function getDefaultOffer(p: OutreachProfile): string {
  return pitchForLang(p, primaryPitchLang(p) ?? "en");
}

/**
 * Client-side outreach profiles (voice + pitch versions by language).
 * Non-secret only — SMTP keys stay in .env (constitution Art. III.5).
 */
import { readMigratedKey } from "@/lib/browser-storage";
import {
  outreachLangFromLocation,
  outreachLangFromText,
  type OutreachLang,
} from "@/lib/outreach/locale";

const KEY = "hermes_sender_profiles";
const LEGACY_MULTI = ["leadify_sender_profiles"];
const LEGACY_SINGLE = "hermes_sender_profile";
const LEGACY_KEYS = ["leadify_sender_profile", "lodestar_sender_profile"];

export type OutreachProfile = {
  id: string;
  name: string;
  displayName: string;
  company: string;
  title: string;
  /** Kept for backward-compat / AI generate website hint. */
  website: string;
  signature: string;
  /** Fallback subject when no per-language subject is set. */
  subjectTemplate: string;
  /**
   * Subject templates by language (optional). Preview/drafting prefer these
   * over `subjectTemplate`.
   */
  subjects: Partial<Record<OutreachLang, string>>;
  /**
   * Email body template versions by language. Same offer, different language —
   * preview and drafting pick the matching version (no sample substitution).
   * May contain light HTML (bold / lists) from the Settings editor.
   */
  pitches: Partial<Record<OutreachLang, string>>;
  /**
   * When true, each draft is AI-rewritten so wording varies per lead.
   * When false, the email body template is used as-is (placeholders only).
   */
  aiPersonalize?: boolean;
  /**
   * @deprecated Prefer aiPersonalize. Kept for migration of older profiles.
   * true = raw template; false = legacy assembled opener/CTA.
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
  "Your Name",
  "Your role | Your company",
].join("\n");

export const DEFAULT_COMPANY = "Your company";

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
    name: partial?.name ?? "Profile 1",
    displayName: partial?.displayName ?? "",
    company: partial?.company ?? DEFAULT_COMPANY,
    title: partial?.title ?? "",
    website: partial?.website ?? "",
    signature: partial?.signature ?? "",
    subjectTemplate: partial?.subjectTemplate ?? "",
    subjects: partial?.subjects ?? {},
    pitches: partial?.pitches ?? {},
    aiPersonalize: partial?.aiPersonalize ?? false,
    staticBody: partial?.staticBody,
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

/** Subject template for a language; falls back to shared subjectTemplate. */
export function subjectForLang(
  p: OutreachProfile,
  lang: OutreachLang,
): string {
  const exact = p.subjects[lang]?.trim();
  if (exact) return exact;
  const primary = primaryPitchLang(p);
  if (primary && primary !== lang) {
    const fromPitchLang = p.subjects[primary]?.trim();
    if (fromPitchLang) return fromPitchLang;
  }
  return p.subjectTemplate.trim();
}

/**
 * Language for drafting from the active profile.
 * Prefer the profile's primary template slot (Settings defaults to English) so
 * drafts match what the user is editing — not a stale secondary language left
 * from an old translate (e.g. Catalonia lead → old `es` while they edit `en`).
 */
export function resolveDraftLang(
  p: OutreachProfile,
  location: string | null | undefined,
): OutreachLang {
  return primaryPitchLang(p) ?? outreachLangFromLocation(location ?? null);
}

/**
 * Primary pitch language = the template slot the user is maintaining.
 * Prefer `en` when set (Settings preview default), else first non-empty slot.
 * Do not jump to another slot just because content language was detected
 * (Spanish text stored under `en` must keep using `en`).
 */
export function primaryPitchLang(p: OutreachProfile): OutreachLang | null {
  const order: OutreachLang[] = ["en", "es", "fr", "it", "de", "pt", "pl"];
  for (const lang of order) {
    if (p.pitches[lang]?.trim()) return lang;
  }
  return null;
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
      name: String(parsed.name ?? "Profile 1"),
      displayName: String(parsed.displayName ?? ""),
      company: String(parsed.company ?? DEFAULT_COMPANY) || DEFAULT_COMPANY,
      title: String(parsed.title ?? ""),
      website: String(parsed.website ?? ""),
      signature: String(parsed.signature ?? ""),
      subjectTemplate: String(parsed.subjectTemplate ?? ""),
      subjects: parsed.subjects ?? {},
      pitches,
      aiPersonalize: resolveAiPersonalize(parsed),
      staticBody: parsed.staticBody,
    });
    return { profiles: [profile], activeId: profile.id };
  } catch {
    return { profiles: [emptyProfile()], activeId: null };
  }
}

function resolveAiPersonalize(
  p: Partial<OutreachProfile> & { aiPersonalize?: boolean; staticBody?: boolean },
): boolean {
  if (typeof p.aiPersonalize === "boolean") return p.aiPersonalize;
  // Older "use pitch as full body" checkbox stored staticBody=true for raw text.
  return false;
}

function readStore(): ProfileStore {
  if (typeof window === "undefined") {
    return { profiles: [], activeId: null };
  }
  try {
    const multi = readMigratedKey(KEY, LEGACY_MULTI);
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
  const subjects: Partial<Record<OutreachLang, string>> = { ...(p.subjects ?? {}) };
  const rawName = String(p.name ?? "").trim();
  return emptyProfile({
    id: p.id,
    name: !rawName || rawName === "Default" ? "Profile 1" : rawName,
    displayName: String(p.displayName ?? ""),
    company: String(p.company ?? DEFAULT_COMPANY) || DEFAULT_COMPANY,
    title: String(p.title ?? ""),
    website: String(p.website ?? ""),
    signature: String(p.signature ?? ""),
    subjectTemplate: String(p.subjectTemplate ?? ""),
    subjects,
    pitches,
    aiPersonalize: resolveAiPersonalize(p),
    staticBody: p.staticBody,
  });
}

function writeStore(store: ProfileStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
  // Write-through to workspace (best-effort; demo/local still works offline).
  if (typeof window !== "undefined") {
    void fetch("/api/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outreachProfilesJson: JSON.stringify(store) }),
    }).catch(() => {});
  }
}

/**
 * Hydrate local cache from the workspace row. One-time migrate: if the server
 * has nothing and localStorage does, push local up.
 */
export async function hydrateOutreachProfilesFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/workspace/settings", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { outreachProfilesJson?: string | null };
    const raw = data.outreachProfilesJson?.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as ProfileStore;
      if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        localStorage.setItem(KEY, JSON.stringify(parsed));
        return;
      }
    }
    // Server empty — migrate local once.
    const local = localStorage.getItem(KEY);
    if (local) {
      await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachProfilesJson: local }),
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
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
    profiles.length > 0 ? profiles : [emptyProfile({ name: "Profile 1" })];
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

/** Draft flags derived from the active profile. */
export function draftFlagsFromProfile(p: OutreachProfile): {
  aiPersonalize: boolean;
  staticBody: boolean;
} {
  const aiPersonalize = Boolean(p.aiPersonalize);
  return {
    aiPersonalize,
    // Raw template unless AI is on (AI uses raw as base then rewrites).
    staticBody: !aiPersonalize,
  };
}

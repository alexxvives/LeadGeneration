/**
 * Soft warmup guidance — recommend daily send caps; never hard-block.
 *
 * Self-report mailbox age next to From email (Settings). Scoped to the
 * board’s outreach profile (one inbox / domain). A timer from when that
 * band was chosen auto-advances cold → weeks → months → years so soft
 * caps grow with the inbox. Plan quotas + per-minute rate limits stay hard.
 */

import { readMigratedKey } from "@/lib/browser-storage";
import type { MailboxAgeBand, MailboxVolumeBand } from "@/lib/types";

export type { MailboxAgeBand, MailboxVolumeBand };

/** Per-profile map (ADR 0027). */
export const WARMUP_STORAGE_KEY = "hermes_warmup_v2";
const WARMUP_LEGACY_SINGLE = "hermes_warmup_v1";
const WARMUP_LEGACY_KEYS = [
  WARMUP_LEGACY_SINGLE,
  "leadify_warmup_v1",
  "lodestar_warmup_v1",
];

export type WarmupProfile = {
  /** ISO date (YYYY-MM-DD) when we started tracking this sender. */
  startedOn: string;
  /** Self-reported when setting From email / connecting a mailbox. */
  ageBand?: MailboxAgeBand;
  /** ISO date when ageBand was last chosen — drives auto-advance timer. */
  ageBandSetOn?: string;
  volumeBand?: MailboxVolumeBand;
  /** Sends counted per calendar day (local). */
  days: Record<string, number>;
};

export const AGE_BAND_OPTIONS: {
  id: MailboxAgeBand;
  label: string;
  hint: string;
}[] = [
  { id: "new", label: "Brand new", hint: "~20/day" },
  { id: "weeks", label: "Weeks", hint: "~25/day" },
  { id: "months", label: "Months", hint: "~40/day" },
  { id: "established", label: "Years", hint: "~80/day" },
];

/**
 * Effective age band after auto-advance from when the user last set ageBand.
 * Brand new → weeks after 14d → months after 90d → years after 365d.
 */
export function effectiveAgeBand(profile: WarmupProfile): MailboxAgeBand {
  const base = profile.ageBand ?? "new";
  const since = daysSince(profile.ageBandSetOn || profile.startedOn);

  if (base === "new") {
    if (since >= 365) return "established";
    if (since >= 90) return "months";
    if (since >= 14) return "weeks";
    return "new";
  }
  if (base === "weeks") {
    if (since >= 351) return "established"; // ~12 mo from “weeks old”
    if (since >= 76) return "months";
    return "weeks";
  }
  if (base === "months") {
    if (since >= 275) return "established";
    return "months";
  }
  return "established";
}

/** Recommended soft daily cap from effective age (+ light volume override). */
export function recommendedDailySoftCap(profile: WarmupProfile): number {
  if (profile.volumeBand === "regular" && effectiveAgeBand(profile) === "established") {
    return 80;
  }
  if (profile.volumeBand === "light") {
    return Math.min(40, capForBand(effectiveAgeBand(profile)));
  }
  return capForBand(effectiveAgeBand(profile));
}

function capForBand(band: MailboxAgeBand): number {
  switch (band) {
    case "established":
      return 80;
    case "months":
      return 40;
    case "weeks":
      return 25;
    default:
      return 20;
  }
}

/** Local calendar YYYY-MM-DD (not UTC — matches “sent today” in the UI). */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function scopeKey(scopeId?: string | null): string {
  const t = scopeId?.trim();
  return t || "_workspace";
}

function emptyProfile(): WarmupProfile {
  return { startedOn: todayKey(), days: {} };
}

function normalizeProfile(parsed: WarmupProfile): WarmupProfile {
  return {
    startedOn: parsed.startedOn || todayKey(),
    ageBand: parsed.ageBand,
    ageBandSetOn: parsed.ageBandSetOn,
    volumeBand: parsed.volumeBand,
    days: parsed.days ?? {},
  };
}

function readMap(): Record<string, WarmupProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(WARMUP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const rec = parsed as Record<string, unknown>;
    // Guard: a leftover v1 blob has `startedOn` at the top level.
    if (typeof rec.startedOn === "string") return {};
    const out: Record<string, WarmupProfile> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = normalizeProfile(v as WarmupProfile);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, WarmupProfile>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WARMUP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadLegacySingle(): WarmupProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readMigratedKey(WARMUP_LEGACY_SINGLE, WARMUP_LEGACY_KEYS);
    if (!raw) return null;
    return normalizeProfile(JSON.parse(raw) as WarmupProfile);
  } catch {
    return null;
  }
}

/**
 * Load warmup for one mailbox. `scopeId` is the board’s outreach profile
 * (or board id if unlinked). New scopes start at “brand new” — we do not
 * copy the old workspace-wide blob onto every domain.
 */
export function loadWarmupProfile(scopeId?: string | null): WarmupProfile {
  if (typeof window === "undefined") return emptyProfile();
  const id = scopeKey(scopeId);
  const map = readMap();
  if (map[id]) return map[id]!;
  if (id === "_workspace") {
    return loadLegacySingle() ?? emptyProfile();
  }
  return emptyProfile();
}

export function saveWarmupProfile(
  profile: WarmupProfile,
  scopeId?: string | null,
): void {
  if (typeof window === "undefined") return;
  const map = readMap();
  map[scopeKey(scopeId)] = normalizeProfile(profile);
  writeMap(map);
}

/** Persist self-reported mailbox age (resets the advance timer). */
export function setMailboxAgeBand(
  ageBand: MailboxAgeBand,
  scopeId?: string | null,
): WarmupProfile {
  const profile = loadWarmupProfile(scopeId);
  const next: WarmupProfile = {
    ...profile,
    ageBand,
    ageBandSetOn: todayKey(),
  };
  saveWarmupProfile(next, scopeId);
  return next;
}

export function recordWarmupSend(scopeId?: string | null): WarmupProfile {
  const profile = loadWarmupProfile(scopeId);
  const key = todayKey();
  profile.days[key] = (profile.days[key] ?? 0) + 1;
  saveWarmupProfile(profile, scopeId);
  return profile;
}

export function warmupStatus(profile = loadWarmupProfile()): {
  todayCount: number;
  softCap: number;
  overSoftCap: boolean;
  ageBand: MailboxAgeBand;
  effectiveBand: MailboxAgeBand;
} {
  const softCap = recommendedDailySoftCap(profile);
  const todayCount = profile.days[todayKey()] ?? 0;
  return {
    todayCount,
    softCap,
    overSoftCap: todayCount >= softCap,
    ageBand: profile.ageBand ?? "new",
    effectiveBand: effectiveAgeBand(profile),
  };
}

function daysSince(isoDate: string): number {
  const start = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const ms = Date.now() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

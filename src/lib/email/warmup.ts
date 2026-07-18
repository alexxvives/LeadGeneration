/**
 * Soft warmup guidance — recommend daily send caps; never hard-block.
 *
 * Self-report mailbox age next to From email (Settings). A timer from when
 * that band was chosen auto-advances cold → weeks → months → years so soft
 * caps grow with the inbox. Plan quotas + per-minute rate limits stay hard.
 */

import { readMigratedKey } from "@/lib/browser-storage";
import type { MailboxAgeBand, MailboxVolumeBand } from "@/lib/types";

export type { MailboxAgeBand, MailboxVolumeBand };

export const WARMUP_STORAGE_KEY = "hermes_warmup_v1";
const WARMUP_LEGACY_KEYS = ["leadify_warmup_v1", "lodestar_warmup_v1"];

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
  { id: "new", label: "Brand new", hint: "~15/day" },
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
      return 15;
  }
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function loadWarmupProfile(): WarmupProfile {
  if (typeof window === "undefined") {
    return { startedOn: todayKey(), days: {} };
  }
  try {
    const raw = readMigratedKey(WARMUP_STORAGE_KEY, WARMUP_LEGACY_KEYS);
    if (!raw) {
      const fresh: WarmupProfile = { startedOn: todayKey(), days: {} };
      localStorage.setItem(WARMUP_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as WarmupProfile;
    return {
      startedOn: parsed.startedOn || todayKey(),
      ageBand: parsed.ageBand,
      ageBandSetOn: parsed.ageBandSetOn,
      volumeBand: parsed.volumeBand,
      days: parsed.days ?? {},
    };
  } catch {
    return { startedOn: todayKey(), days: {} };
  }
}

export function saveWarmupProfile(profile: WarmupProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WARMUP_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

/** Persist self-reported mailbox age (resets the advance timer). */
export function setMailboxAgeBand(ageBand: MailboxAgeBand): WarmupProfile {
  const profile = loadWarmupProfile();
  const next: WarmupProfile = {
    ...profile,
    ageBand,
    ageBandSetOn: todayKey(),
  };
  saveWarmupProfile(next);
  return next;
}

export function recordWarmupSend(): WarmupProfile {
  const profile = loadWarmupProfile();
  const key = todayKey();
  profile.days[key] = (profile.days[key] ?? 0) + 1;
  saveWarmupProfile(profile);
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

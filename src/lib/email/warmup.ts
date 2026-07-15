/**
 * Soft warmup guidance — recommend daily send caps; never hard-block.
 *
 * We cannot know if a mailbox/domain is “warm” from providers. Heuristics:
 *  - optional self-report when linking a mailbox (age + volume)
 *  - otherwise assume cold/new and recommend a low daily ramp
 *
 * Enforcement is UI-only: warn once per send over the recommend; user can
 * continue. Plan quotas + per-minute rate limits remain hard guards.
 */

export const WARMUP_STORAGE_KEY = "lodestar_warmup_v1";

export type MailboxAgeBand = "new" | "weeks" | "months" | "established";
export type MailboxVolumeBand = "none" | "light" | "regular";

export type WarmupProfile = {
  /** ISO date (YYYY-MM-DD) when we started tracking this sender. */
  startedOn: string;
  /** Self-reported when connecting a mailbox (optional). */
  ageBand?: MailboxAgeBand;
  volumeBand?: MailboxVolumeBand;
  /** Sends counted per calendar day (local). */
  days: Record<string, number>;
};

/** Recommended soft daily cap from self-report + ramp day. */
export function recommendedDailySoftCap(profile: WarmupProfile): number {
  if (profile.ageBand === "established" && profile.volumeBand === "regular") {
    return 80;
  }
  if (profile.ageBand === "months" || profile.volumeBand === "light") {
    return 40;
  }
  if (profile.ageBand === "weeks") {
    return 25;
  }
  // Assume cold / new — ramp by week since startedOn
  const day = daysSince(profile.startedOn);
  if (day < 7) return 15;
  if (day < 14) return 25;
  if (day < 28) return 40;
  return 60;
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function loadWarmupProfile(): WarmupProfile {
  if (typeof window === "undefined") {
    return { startedOn: todayKey(), days: {} };
  }
  try {
    const raw = localStorage.getItem(WARMUP_STORAGE_KEY);
    if (!raw) {
      const fresh: WarmupProfile = { startedOn: todayKey(), days: {} };
      localStorage.setItem(WARMUP_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as WarmupProfile;
    return {
      startedOn: parsed.startedOn || todayKey(),
      ageBand: parsed.ageBand,
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
} {
  const softCap = recommendedDailySoftCap(profile);
  const todayCount = profile.days[todayKey()] ?? 0;
  return { todayCount, softCap, overSoftCap: todayCount >= softCap };
}

function daysSince(isoDate: string): number {
  const start = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const ms = Date.now() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Client-side sender / voice profile for draft personalization.
 * Non-secret only — SMTP keys stay in .env (constitution Art. III.5).
 * Prefills search offer notes and shows in Settings.
 */
const KEY = "lodestar_sender_profile";

export type SenderProfile = {
  displayName: string;
  company: string;
  title: string;
  defaultOffer: string;
  signature: string;
};

const EMPTY: SenderProfile = {
  displayName: "",
  company: "",
  title: "",
  defaultOffer: "",
  signature: "",
};

export function loadSenderProfile(): SenderProfile {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<SenderProfile>;
    return {
      displayName: String(parsed.displayName ?? ""),
      company: String(parsed.company ?? ""),
      title: String(parsed.title ?? ""),
      defaultOffer: String(parsed.defaultOffer ?? ""),
      signature: String(parsed.signature ?? ""),
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveSenderProfile(profile: SenderProfile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

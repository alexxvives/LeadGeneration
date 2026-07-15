/**
 * Client-side sender / voice profile for draft personalization.
 * Non-secret only — SMTP keys stay in .env (constitution Art. III.5).
 * Prefills search offer notes and shows in Settings.
 */
import { readMigratedKey } from "@/lib/browser-storage";

const KEY = "leadify_sender_profile";
const LEGACY_KEYS = ["lodestar_sender_profile"];

export type SenderProfile = {
  displayName: string;
  company: string;
  title: string;
  /** Kept for backward-compat with older localStorage blobs (no longer shown in UI). */
  website: string;
  defaultOffer: string;
  signature: string;
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

const EMPTY: SenderProfile = {
  displayName: "",
  company: DEFAULT_COMPANY,
  title: "",
  website: "",
  defaultOffer: "",
  signature: "",
};

/** Build a 2–3 line sign-off from profile fields. */
export function buildSignature(
  p: Pick<SenderProfile, "displayName" | "title" | "company" | "website">,
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
export function resolveSignature(p: SenderProfile): string {
  const saved = p.signature.trim();
  if (saved) return saved;
  const built = buildSignature(p);
  return built || SIGNATURE_PLACEHOLDER;
}

export function loadSenderProfile(): SenderProfile {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = readMigratedKey(KEY, LEGACY_KEYS);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<SenderProfile>;
    return {
      displayName: String(parsed.displayName ?? ""),
      company: String(parsed.company ?? DEFAULT_COMPANY) || DEFAULT_COMPANY,
      title: String(parsed.title ?? ""),
      website: String(parsed.website ?? ""),
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

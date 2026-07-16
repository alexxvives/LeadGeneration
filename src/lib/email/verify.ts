/**
 * Email verification via Zeruh (Maileroo's verify product).
 * https://zeruh.com/api-docs — base https://api.zeruh.com/v1/verify
 *
 * Called at **send** time (not enrich) so we spend ~1 credit per outbound
 * and cover search + Excel-imported leads equally.
 * Degrades to a local heuristic when no key is set (demo / zero-key mode).
 */

import { env } from "@/lib/config";

export type EmailVerifyStatus =
  | "deliverable"
  | "risky"
  | "undeliverable"
  | "unknown"
  | "skipped";

export interface EmailVerifyResult {
  email: string;
  status: EmailVerifyStatus;
  score: number | null;
  reason: string | null;
  /** True when it is safe enough to send (or we could not verify). */
  okToSend: boolean;
  provider: "zeruh" | "heuristic";
}

const CACHE = new Map<string, EmailVerifyResult>();

function heuristic(email: string): EmailVerifyResult {
  const lower = email.toLowerCase().trim();
  const at = lower.indexOf("@");
  if (at <= 0 || !lower.includes(".", at)) {
    return {
      email: lower,
      status: "undeliverable",
      score: 0,
      reason: "invalid_format",
      okToSend: false,
      provider: "heuristic",
    };
  }
  const local = lower.slice(0, at);
  if (/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster)/i.test(local)) {
    return {
      email: lower,
      status: "undeliverable",
      score: 10,
      reason: "no_reply",
      okToSend: false,
      provider: "heuristic",
    };
  }
  // Soft pass — real SMTP/MX check needs Zeruh.
  return {
    email: lower,
    status: "skipped",
    score: null,
    reason: "no_verify_key",
    okToSend: true,
    provider: "heuristic",
  };
}

/**
 * Verify a single address. Cached in-process for the Worker/request lifetime.
 * Without MAILEROO_VERIFY_API_KEY / ZERUH_API_KEY → heuristic only (never blocks).
 */
export async function verifyEmail(email: string): Promise<EmailVerifyResult> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) {
    return {
      email: "",
      status: "undeliverable",
      score: 0,
      reason: "empty",
      okToSend: false,
      provider: "heuristic",
    };
  }

  const cached = CACHE.get(normalized);
  if (cached) return cached;

  const key = env.emailVerifyKey();
  if (!key) {
    const h = heuristic(normalized);
    CACHE.set(normalized, h);
    return h;
  }

  try {
    const url = new URL("https://api.zeruh.com/v1/verify");
    url.searchParams.set("email_address", normalized);
    url.searchParams.set("timeout", "15");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "X-Api-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const fallback = heuristic(normalized);
      // Fail open on API errors so a down verifier never freezes outreach.
      const soft: EmailVerifyResult = {
        ...fallback,
        status: "unknown",
        reason: `verify_http_${res.status}`,
        okToSend: true,
        provider: "zeruh",
      };
      CACHE.set(normalized, soft);
      return soft;
    }

    const data = (await res.json()) as {
      success?: boolean;
      result?: {
        status?: string;
        score?: number;
        reason?: string;
        validation_details?: { disposable?: boolean; no_reply?: boolean };
      };
    };

    const raw = data.result?.status?.toLowerCase() ?? "unknown";
    const status: EmailVerifyStatus =
      raw === "deliverable" || raw === "risky" || raw === "undeliverable" || raw === "unknown"
        ? raw
        : "unknown";

    const disposable = data.result?.validation_details?.disposable === true;
    const noReply = data.result?.validation_details?.no_reply === true;
    const undeliverable =
      status === "undeliverable" || disposable || noReply;

    const result: EmailVerifyResult = {
      email: normalized,
      status: undeliverable ? "undeliverable" : status,
      score: typeof data.result?.score === "number" ? data.result.score : null,
      reason: data.result?.reason ?? null,
      // Block only hard undeliverables; allow risky/unknown (cold lists often
      // include catch-alls). User still has human approval.
      okToSend: !undeliverable,
      provider: "zeruh",
    };
    CACHE.set(normalized, result);
    return result;
  } catch (err) {
    console.error("[email-verify] Zeruh request failed:", err);
    const soft: EmailVerifyResult = {
      email: normalized,
      status: "unknown",
      score: null,
      reason: "verify_error",
      okToSend: true,
      provider: "zeruh",
    };
    CACHE.set(normalized, soft);
    return soft;
  }
}

/**
 * Optional batch helper — unused on the search path (verify is send-only).
 * Kept for scripts / future list-hygiene tools. Caps at first 3 candidates.
 */
export async function filterVerifiableEmails(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const head = emails.slice(0, 3);
  const rest = emails.slice(3);
  const kept: string[] = [];
  for (const e of head) {
    const v = await verifyEmail(e);
    if (v.okToSend) kept.push(e);
  }
  if (!env.emailVerifyKey()) return emails;
  return [...kept, ...rest.filter((e) => !head.includes(e))];
}

/**
 * Email verification at **send** time (not enrich).
 *
 * Prefer MyEmailVerifier (MYEMAILVERIFIER_API_KEY) — 100 free credits/day.
 * Fall back to Zeruh / Maileroo Verify (MAILEROO_VERIFY_API_KEY / ZERUH_API_KEY).
 * No key → local heuristic (demo / zero-key; never blocks).
 */

import { env } from "@/lib/config";

export type EmailVerifyStatus =
  | "deliverable"
  | "risky"
  | "undeliverable"
  | "unknown"
  | "skipped";

export type EmailVerifyProvider = "myemailverifier" | "zeruh" | "heuristic";

export interface EmailVerifyResult {
  email: string;
  status: EmailVerifyStatus;
  score: number | null;
  reason: string | null;
  /** True when it is safe enough to send (or we could not verify). */
  okToSend: boolean;
  provider: EmailVerifyProvider;
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
  return {
    email: lower,
    status: "skipped",
    score: null,
    reason: "no_verify_key",
    okToSend: true,
    provider: "heuristic",
  };
}

function softUnknown(
  email: string,
  provider: EmailVerifyProvider,
  reason: string,
): EmailVerifyResult {
  return {
    email,
    status: "unknown",
    score: null,
    reason,
    okToSend: true,
    provider,
  };
}

async function verifyMyEmailVerifier(
  email: string,
  key: string,
): Promise<EmailVerifyResult> {
  const url = new URL("https://api.myemailverifier.com/api/validate_single.php");
  url.searchParams.set("apikey", key);
  url.searchParams.set("email", email);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });

  const text = await res.text().catch(() => "");
  let data: {
    Status?: string;
    Diagnosis?: string;
    Disposable_Domain?: string;
    catch_all?: string;
    status?: boolean;
    message?: string;
    error?: string;
  } = {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    /* non-JSON */
  }

  if (res.status === 401 || data.error === "INVALID_API_KEY") {
    console.error("[email-verify] MyEmailVerifier invalid API key");
    return softUnknown(email, "myemailverifier", "verify_auth_failed");
  }
  if (!res.ok) {
    console.error("[email-verify] MyEmailVerifier HTTP", res.status, text.slice(0, 160));
    return softUnknown(email, "myemailverifier", `verify_http_${res.status}`);
  }

  const raw = (data.Status ?? "").toLowerCase();
  const disposable = String(data.Disposable_Domain).toLowerCase() === "true";
  const status: EmailVerifyStatus =
    raw === "valid"
      ? "deliverable"
      : raw === "invalid"
        ? "undeliverable"
        : raw === "catch-all" || raw === "catchall"
          ? "risky"
          : "unknown";

  const undeliverable = status === "undeliverable" || disposable;
  return {
    email,
    status: undeliverable ? "undeliverable" : status,
    score: null,
    reason: data.Diagnosis ?? (raw || null),
    okToSend: !undeliverable,
    provider: "myemailverifier",
  };
}

async function verifyZeruh(email: string, key: string): Promise<EmailVerifyResult> {
  const url = new URL("https://api.zeruh.com/v1/verify");
  url.searchParams.set("email_address", email);
  url.searchParams.set("timeout", "15");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "X-Api-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[email-verify] Zeruh HTTP", res.status, text.slice(0, 160));
    // Auth failures must never block send — often a wrong key (e.g. MEV key in Zeruh slot).
    return softUnknown(email, "zeruh", `verify_http_${res.status}`);
  }

  const data = (await res.json()) as {
    success?: boolean;
    message?: string;
    result?: {
      status?: string;
      score?: number;
      reason?: string;
      validation_details?: { disposable?: boolean; no_reply?: boolean };
    };
  };

  if (data.success === false) {
    console.error("[email-verify] Zeruh rejected:", data.message);
    return softUnknown(email, "zeruh", "verify_auth_failed");
  }

  const raw = data.result?.status?.toLowerCase() ?? "unknown";
  const status: EmailVerifyStatus =
    raw === "deliverable" ||
    raw === "risky" ||
    raw === "undeliverable" ||
    raw === "unknown"
      ? raw
      : "unknown";

  const disposable = data.result?.validation_details?.disposable === true;
  const noReply = data.result?.validation_details?.no_reply === true;
  const undeliverable = status === "undeliverable" || disposable || noReply;

  return {
    email,
    status: undeliverable ? "undeliverable" : status,
    score: typeof data.result?.score === "number" ? data.result.score : null,
    reason: data.result?.reason ?? null,
    okToSend: !undeliverable,
    provider: "zeruh",
  };
}

/**
 * Verify a single address. Cached in-process for the Worker/request lifetime.
 * Prefer MyEmailVerifier; else Zeruh; else heuristic (never blocks).
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

  const mev = env.myEmailVerifierKey();
  const zeruh = env.zeruhVerifyKey();

  try {
    let result: EmailVerifyResult;
    if (mev) {
      result = await verifyMyEmailVerifier(normalized, mev);
    } else if (zeruh) {
      result = await verifyZeruh(normalized, zeruh);
    } else {
      result = heuristic(normalized);
    }
    CACHE.set(normalized, result);
    return result;
  } catch (err) {
    console.error("[email-verify] request failed:", err);
    const soft = softUnknown(
      normalized,
      mev ? "myemailverifier" : zeruh ? "zeruh" : "heuristic",
      "verify_error",
    );
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
  if (!env.myEmailVerifierKey() && !env.zeruhVerifyKey()) return emails;
  return [...kept, ...rest.filter((e) => !head.includes(e))];
}

/**
 * Email verification at **send** time (not enrich).
 *
 * Prefer MyEmailVerifier (MYEMAILVERIFIER_API_KEY) — 100 free credits/day.
 * Fall back to Zeruh / Maileroo Verify (MAILEROO_VERIFY_API_KEY / ZERUH_API_KEY).
 * No key → local heuristic (demo / zero-key; never blocks).
 *
 * Policy: only hard-block clear junk (disposable / no-reply / bad format).
 * MEV "Invalid" is a soft block — SMTP probes false-positive often on
 * info@/contact@ and greylisted SMB domains. Caller may force-send.
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
  /**
   * True only for high-confidence junk (disposable / no-reply / bad format).
   * Soft "Invalid" from MEV stays false so we never auto-strip the address.
   */
  hardFail: boolean;
  provider: EmailVerifyProvider;
  /**
   * True when this call hit a live provider (counts against plan + provider
   * credits). False for cache hits, auth/credit errors, and local heuristic.
   */
  billed: boolean;
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
      hardFail: true,
      provider: "heuristic",
      billed: false,
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
      hardFail: true,
      provider: "heuristic",
      billed: false,
    };
  }
  return {
    email: lower,
    status: "skipped",
    score: null,
    reason: "no_verify_key",
    okToSend: true,
    hardFail: false,
    provider: "heuristic",
    billed: false,
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
    hardFail: false,
    provider,
    // Auth/HTTP failures usually did not consume a credit — don't bill plan.
    billed: false,
  };
}

function isTruthyFlag(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return v.trim().toLowerCase() === "true";
  return false;
}

async function verifyMyEmailVerifier(
  email: string,
  key: string,
): Promise<EmailVerifyResult> {
  // Docs: GET /verifier/validate_single/{email}/{API_KEY} on client host.
  // Legacy api.myemailverifier.com/validate_single.php is wrong / fail-open.
  const url = `https://client.myemailverifier.com/verifier/validate_single/${encodeURIComponent(email)}/${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });

  const text = await res.text().catch(() => "");
  let data: {
    Status?: string;
    Diagnosis?: string;
    Disposable_Domain?: string | boolean;
    Greylisted?: string | boolean;
    catch_all?: string | boolean;
    /** boolean false = account/credits; string "error" on legacy api host */
    status?: boolean | string;
    message?: string;
    error?: string;
  } = {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    /* non-JSON */
  }

  const statusFlag = data.status;
  const authFailed =
    res.status === 401 ||
    res.status === 403 ||
    data.error === "INVALID_API_KEY" ||
    data.error === "unauthorized" ||
    statusFlag === "error" ||
    /invalid api key|unauthorized|user not found/i.test(
      `${data.message ?? ""} ${data.error ?? ""}`,
    );
  if (authFailed) {
    console.error(
      "[email-verify] MyEmailVerifier auth failed:",
      data.message ?? data.error ?? text.slice(0, 120),
    );
    return softUnknown(email, "myemailverifier", "verify_auth_failed");
  }
  if (!res.ok) {
    console.error("[email-verify] MyEmailVerifier HTTP", res.status, text.slice(0, 160));
    return softUnknown(email, "myemailverifier", `verify_http_${res.status}`);
  }

  // MEV returns HTTP 200 with status:false for credits / blocked account / etc.
  if (statusFlag === false) {
    console.error(
      "[email-verify] MyEmailVerifier account error (fail-open):",
      data.message ?? text.slice(0, 160),
    );
    return softUnknown(
      email,
      "myemailverifier",
      data.message?.slice(0, 80) || "verify_account_error",
    );
  }

  const raw = (data.Status ?? "").toLowerCase().replace(/\s+/g, "-");
  if (!raw) {
    console.error(
      "[email-verify] MyEmailVerifier missing Status (fail-open):",
      text.slice(0, 160),
    );
    return softUnknown(email, "myemailverifier", "verify_empty_status");
  }

  const disposable = isTruthyFlag(data.Disposable_Domain);
  const greylisted =
    isTruthyFlag(data.Greylisted) ||
    raw === "grey-listed" ||
    raw === "greylisted" ||
    raw === "grey_listed";

  const status: EmailVerifyStatus =
    raw === "valid"
      ? "deliverable"
      : raw === "invalid"
        ? "undeliverable"
        : raw === "catch-all" || raw === "catchall" || isTruthyFlag(data.catch_all)
          ? "risky"
          : greylisted
            ? "risky"
            : "unknown";

  // Disposable = junk. Grey-listed / catch-all = allow (ambiguous, not proof of
  // dead mailbox). Plain Invalid = soft block (SMTP false positives are common).
  if (disposable) {
    return {
      email,
      status: "undeliverable",
      score: null,
      reason: data.Diagnosis ?? "disposable",
      okToSend: false,
      hardFail: true,
      provider: "myemailverifier",
      billed: true,
    };
  }

  if (status === "undeliverable" && !greylisted) {
    console.warn(
      "[email-verify] MEV Invalid (soft-block):",
      email,
      data.Diagnosis ?? raw,
    );
    return {
      email,
      status: "undeliverable",
      score: null,
      reason: data.Diagnosis ?? raw,
      okToSend: false,
      hardFail: false,
      provider: "myemailverifier",
      billed: true,
    };
  }

  return {
    email,
    status: greylisted || status === "risky" ? "risky" : status,
    score: null,
    reason: data.Diagnosis ?? (raw || null),
    okToSend: true,
    hardFail: false,
    provider: "myemailverifier",
    billed: true,
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

  if (disposable || noReply) {
    return {
      email,
      status: "undeliverable",
      score: typeof data.result?.score === "number" ? data.result.score : null,
      reason: data.result?.reason ?? (disposable ? "disposable" : "no_reply"),
      okToSend: false,
      hardFail: true,
      provider: "zeruh",
      billed: true,
    };
  }

  if (status === "undeliverable") {
    console.warn(
      "[email-verify] Zeruh undeliverable (soft-block):",
      email,
      data.result?.reason ?? raw,
    );
    return {
      email,
      status: "undeliverable",
      score: typeof data.result?.score === "number" ? data.result.score : null,
      reason: data.result?.reason ?? raw,
      okToSend: false,
      hardFail: false,
      provider: "zeruh",
      billed: true,
    };
  }

  return {
    email,
    status,
    score: typeof data.result?.score === "number" ? data.result.score : null,
    reason: data.result?.reason ?? null,
    okToSend: true,
    hardFail: false,
    provider: "zeruh",
    billed: true,
  };
}

/** In-process cache peek — used to allow re-sends without burning plan quota. */
export function getCachedVerify(email: string): EmailVerifyResult | null {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return null;
  return CACHE.get(normalized) ?? null;
}

/** Drop a cached result so a force-send path can re-check later if needed. */
export function clearCachedVerify(email: string): void {
  const normalized = email.toLowerCase().trim();
  if (normalized) CACHE.delete(normalized);
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
      hardFail: true,
      provider: "heuristic",
      billed: false,
    };
  }

  const cached = CACHE.get(normalized);
  if (cached) return { ...cached, billed: false };

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
    // Cache without billing flag so callers always get billed:false on hit.
    CACHE.set(normalized, { ...result, billed: false });
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

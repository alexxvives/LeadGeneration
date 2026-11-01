import type { PlanId } from "@/lib/types";

/**
 * Thrown by the service layer when a workspace exceeds its plan quota. API
 * routes translate this into a friendly 402 (Payment Required) response.
 *
 * Quota enforcement lives ONLY in the service layer (constitution Art. II +
 * commercialization hard-constraint 4). Never enforce quotas in UI or routes.
 */
export class QuotaError extends Error {
  readonly kind: "leads" | "sends" | "verifies";
  readonly planId: PlanId;
  readonly limit: number;
  readonly used: number;

  constructor(args: {
    kind: "leads" | "sends" | "verifies";
    planId: PlanId;
    limit: number;
    used: number;
    message?: string;
  }) {
    super(
      args.message ??
        (args.kind === "verifies"
          ? `Daily email verification limit reached for the ${args.planId} plan (${args.used}/${args.limit}). Try again tomorrow.`
          : `Monthly ${args.kind} limit reached for the ${args.planId} plan (${args.used}/${args.limit}). Upgrade to continue.`),
    );
    this.name = "QuotaError";
    this.kind = args.kind;
    this.planId = args.planId;
    this.limit = args.limit;
    this.used = args.used;
  }
}

export function isQuotaError(err: unknown): err is QuotaError {
  return err instanceof QuotaError;
}

/**
 * Thrown when auth is enforced but the request has no resolvable workspace
 * (missing session, provision failure). Routes map this to `status` (default 401).
 * Misconfiguration (e.g. D1 without AUTH_SECRET) uses 503.
 */
export class AuthError extends Error {
  readonly status: number;

  constructor(message = "Sign in required.", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}

const BULK_ACTIVITY: Record<string, string> = {
  import: "importing leads",
  search: "running Find leads",
  delete: "deleting leads",
};

/** Another user's bulk action (import / Find leads / bulk delete) is running — 423. */
export class BoardLockedError extends Error {
  readonly holderName: string | null;
  readonly holderUserId: string;
  readonly kind: string | null;

  constructor(holderUserId: string, holderName: string | null, kind?: string | null) {
    const who = holderName?.trim() || "Someone else";
    const what = (kind && BULK_ACTIVITY[kind]) || "running a bulk action";
    super(`${who} is ${what} on this board — try again in a moment.`);
    this.name = "BoardLockedError";
    this.holderUserId = holderUserId;
    this.holderName = holderName;
    this.kind = kind ?? null;
  }
}

export function isBoardLockedError(err: unknown): err is BoardLockedError {
  return err instanceof BoardLockedError;
}

/** Thrown when a workspace row is missing for an update that must persist. */
export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function isNotFoundError(err: unknown): err is NotFoundError {
  return err instanceof NotFoundError;
}

/** Feature or action forbidden for this account (e.g. Find leads disabled). */
export class ForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "Forbidden.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function isForbiddenError(err: unknown): err is ForbiddenError {
  return err instanceof ForbiddenError;
}

/** Same-field edit collision on a lead (HTTP 409). */
export class LeadConflictError extends Error {
  constructor(
    readonly conflicts: { field: string; yours: unknown; theirs: unknown }[],
    readonly current: unknown,
    readonly changedBy: string | null,
  ) {
    super(
      changedBy
        ? `Changed by ${changedBy} while you were editing.`
        : "This lead changed while you were editing.",
    );
    this.name = "LeadConflictError";
  }
}

export function isLeadConflictError(e: unknown): e is LeadConflictError {
  return e instanceof LeadConflictError || (e as Error | null)?.name === "LeadConflictError";
}

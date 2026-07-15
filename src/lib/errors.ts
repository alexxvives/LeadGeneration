import type { PlanId } from "@/lib/types";

/**
 * Thrown by the service layer when a workspace exceeds its plan quota. API
 * routes translate this into a friendly 402 (Payment Required) response.
 *
 * Quota enforcement lives ONLY in the service layer (constitution Art. II +
 * commercialization hard-constraint 4). Never enforce quotas in UI or routes.
 */
export class QuotaError extends Error {
  readonly kind: "leads" | "sends";
  readonly planId: PlanId;
  readonly limit: number;
  readonly used: number;

  constructor(args: {
    kind: "leads" | "sends";
    planId: PlanId;
    limit: number;
    used: number;
    message?: string;
  }) {
    super(
      args.message ??
        `Monthly ${args.kind} limit reached for the ${args.planId} plan (${args.used}/${args.limit}). Upgrade to continue.`,
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
 * (missing session, provision failure). Routes map this to 401.
 */
export class AuthError extends Error {
  constructor(message = "Sign in required.") {
    super(message);
    this.name = "AuthError";
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
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

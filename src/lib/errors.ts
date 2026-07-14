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

import type { PlanId } from "@/lib/types";

/**
 * Single source of truth for plans, quotas, and pricing.
 *
 * Numbers from docs/financial-plan.md. Stripe Price IDs are read from env
 * (never hard-coded) — see `.env.example` and docs/stripe-setup.md.
 */
export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD (annual is derived with ANNUAL_DISCOUNT). */
  monthlyPrice: number;
  /** Enriched leads allowed per month. */
  leadCreditsPerMonth: number;
  /** Approved sends allowed per month. */
  sendsPerMonth: number;
  /**
   * Email verifications allowed per day (UTC). Caps plan fairness against the
   * shared MyEmailVerifier free pool (~100/day platform-wide). Agency matches
   * that ceiling; lower plans get less.
   */
  verifiesPerDay: number;
  /** Marketing feature bullets shown on /pricing. */
  features: string[];
  /**
   * Env var name holding the Stripe monthly Price ID for this plan. Free has no
   * Stripe price (it is the default, unpaid plan).
   */
  stripePriceEnv: string | null;
}

/** Annual billing discount (industry norm ≈ 20%). */
export const ANNUAL_DISCOUNT = 0.2;

/**
 * Selectable lead-count options in the search UI. An option is available when
 * it fits under the plan’s monthly lead-credit cap *and* remaining credits
 * this period (no separate Free per-run lock).
 */
export const LEAD_COUNT_OPTIONS = [10, 25, 50, 100, 500] as const;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    leadCreditsPerMonth: 75,
    sendsPerMonth: 30,
    verifiesPerDay: 5,
    features: [
      "Demo + live search, drafting & approval",
      "75 enriched leads / month",
      "30 sends / month (bring your own sender)",
      "5 email verifies / day",
      "1 workspace",
    ],
    stripePriceEnv: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 39,
    leadCreditsPerMonth: 400,
    sendsPerMonth: 400,
    verifiesPerDay: 25,
    features: [
      "Everything in Free",
      "400 enriched leads / month",
      "400 sends / month",
      "25 email verifies / day",
      "Table + board views, Excel export",
    ],
    stripePriceEnv: "STRIPE_STARTER_PRICE_ID",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 89,
    leadCreditsPerMonth: 2000,
    sendsPerMonth: 2000,
    verifiesPerDay: 50,
    features: [
      "Everything in Starter",
      "2,000 enriched leads / month",
      "2,000 sends / month",
      "50 email verifies / day",
      "LLM personalization",
      "Places / local source, priority support",
    ],
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthlyPrice: 199,
    leadCreditsPerMonth: 8000,
    sendsPerMonth: 8000,
    verifiesPerDay: 100,
    features: [
      "Everything in Pro",
      "8,000 enriched leads / month",
      "8,000 sends / month",
      "100 email verifies / day",
      "Multiple workspaces / seats",
      "Custom sending identity",
    ],
    stripePriceEnv: "STRIPE_AGENCY_PRICE_ID",
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "agency"];

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId] ?? PLANS.free;
}

/** Monthly price shown for annual billing (per-month, ~20% off). */
export function annualMonthlyPrice(plan: Plan): number {
  return Math.round(plan.monthlyPrice * (1 - ANNUAL_DISCOUNT));
}

/** Reverse-lookup a plan from a Stripe Price ID (used by the webhook). */
export function planIdForPriceId(
  priceId: string | null | undefined,
  priceIdByPlan: Partial<Record<PlanId, string | undefined>>,
): PlanId | null {
  if (!priceId) return null;
  for (const id of PLAN_ORDER) {
    if (priceIdByPlan[id] && priceIdByPlan[id] === priceId) return id;
  }
  return null;
}

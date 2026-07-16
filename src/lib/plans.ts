import type { PlanId } from "@/lib/types";

/**
 * Single source of truth for plans, quotas, and pricing.
 *
 * Prices/quotas come from docs/business-plan.md §6. Stripe Price IDs are read
 * from env (never hard-coded) so the same code works across test/live Stripe
 * accounts — see `.env.example`. Changing a number here is the only edit needed
 * to change a plan; the service layer, pricing page, and settings all read this.
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

/** Free plan hard cap on leads returned per search run (paid uses MAX_LEADS_PER_RUN). */
export const FREE_MAX_LEADS_PER_RUN = 10;

/** Selectable lead-count options in the search UI (higher values locked on Free). */
export const LEAD_COUNT_OPTIONS = [10, 25, 50, 100, 500] as const;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    leadCreditsPerMonth: 50,
    sendsPerMonth: 25,
    features: [
      "Demo + live search, drafting & approval",
      "50 enriched leads / month",
      "25 sends / month (bring your own sender)",
      "1 workspace",
    ],
    stripePriceEnv: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    leadCreditsPerMonth: 500,
    sendsPerMonth: 500,
    features: [
      "Everything in Free",
      "500 enriched leads / month",
      "500 sends / month",
      "Email verification, table + board views",
      "Excel export",
    ],
    stripePriceEnv: "STRIPE_STARTER_PRICE_ID",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 79,
    leadCreditsPerMonth: 2500,
    sendsPerMonth: 2500,
    features: [
      "Everything in Starter",
      "2,500 enriched leads / month",
      "2,500 sends / month",
      "LLM personalization",
      "Places / local source, priority support",
    ],
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthlyPrice: 199,
    leadCreditsPerMonth: 10000,
    sendsPerMonth: 10000,
    features: [
      "Everything in Pro",
      "10,000 enriched leads / month",
      "10,000 sends / month",
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

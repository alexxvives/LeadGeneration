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
  /** Approved sends allowed per month (ignored when unlimitedSends). */
  sendsPerMonth: number;
  /** BYO mailbox / Easy key — no platform send meter. */
  unlimitedSends?: boolean;
  /**
   * Email verifications allowed per day (UTC). Caps plan fairness against the
   * shared MyEmailVerifier free pool (~100/day platform-wide).
   */
  verifiesPerDay: number;
  /** Marketing feature bullets shown on /pricing. */
  features: string[];
  /**
   * Env var name holding the Stripe monthly Price ID for this plan. Free has no
   * Stripe price (it is the default, unpaid plan).
   */
  stripePriceEnv: string | null;
  /**
   * Hidden from /pricing and checkout. Assignable only via admin plan override.
   * Lead slots track remaining Firecrawl credits on the shared API key.
   */
  hidden?: boolean;
}

/** Annual billing discount (industry norm ≈ 20%). */
export const ANNUAL_DISCOUNT = 0.2;

/** Per-request UI options — hard-capped at 50 (sync Worker run; TODO(queue)). */
export const LEAD_COUNT_OPTIONS = [10, 25, 50] as const;

/** Firecrawl free plan allotment (credits/mo) — Insider shared pool basis. */
export const FIRECRAWL_FREE_MONTHLY_CREDITS = 1000;

/**
 * Fallback when the Firecrawl credit-usage API is unreachable — show/use the
 * free-tier monthly allotment as raw credits (not ÷ estimated burn).
 */
export const INSIDER_CREDITS_FALLBACK = FIRECRAWL_FREE_MONTHLY_CREDITS;

/**
 * Platform-wide Insider knobs. Lead capacity = live Firecrawl remaining
 * credits on the shared API key (raw). Sends are unlimited (BYO sender).
 * Verifies stay capped to the MEV free daily pool.
 */
export const INSIDER_SHARED_POOL = {
  /** Soft display cap when credit API is down (raw FC credits). */
  leadCreditsPerMonth: INSIDER_CREDITS_FALLBACK,
  unlimitedSends: true as const,
  verifiesPerDay: 100,
} as const;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    leadCreditsPerMonth: 50,
    sendsPerMonth: 20,
    verifiesPerDay: 5,
    features: [
      "Live search, draft, approve & send",
      "50 enriched leads / month",
      "20 sends / month (bring your own sender)",
      "5 email verifies / day",
      "Map, pipeline, boards & Excel export",
    ],
    stripePriceEnv: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 19,
    leadCreditsPerMonth: 150,
    sendsPerMonth: 150,
    verifiesPerDay: 15,
    features: [
      "Everything in Free",
      "150 enriched leads / month",
      "150 sends / month",
      "15 email verifies / day",
    ],
    stripePriceEnv: "STRIPE_STARTER_PRICE_ID",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 49,
    leadCreditsPerMonth: 600,
    sendsPerMonth: 600,
    verifiesPerDay: 30,
    features: [
      "Everything in Starter",
      "600 enriched leads / month",
      "600 sends / month",
      "30 email verifies / day",
      "AI blurbs & pitch assist (when configured)",
    ],
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthlyPrice: 99,
    leadCreditsPerMonth: 2000,
    sendsPerMonth: 2000,
    verifiesPerDay: 50,
    features: [
      "Everything in Pro",
      "2,000 enriched leads / month",
      "2,000 sends / month",
      "50 email verifies / day",
      "Highest daily verify allowance",
    ],
    stripePriceEnv: "STRIPE_AGENCY_PRICE_ID",
  },
  insider: {
    id: "insider",
    name: "Insider",
    monthlyPrice: 0,
    leadCreditsPerMonth: INSIDER_SHARED_POOL.leadCreditsPerMonth,
    sendsPerMonth: 0,
    unlimitedSends: true,
    verifiesPerDay: INSIDER_SHARED_POOL.verifiesPerDay,
    features: [
      "Hidden friend tier — not on /pricing",
      "Shared Firecrawl remaining credits (raw — one pool for all Insiders)",
      "Unlimited sends (bring your own mailbox / Easy key)",
      "100 email verifies / day shared (MEV free tier)",
    ],
    stripePriceEnv: null,
    hidden: true,
  },
};

/** Public plans shown on /pricing and in upgrade CTAs. */
export const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "agency"];

/** Admin plan override — includes hidden Insider. */
export const ADMIN_PLAN_ORDER: PlanId[] = [
  "free",
  "starter",
  "pro",
  "agency",
  "insider",
];

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId] ?? PLANS.free;
}

export function isPaidPlan(planId: PlanId): boolean {
  return getPlan(planId).monthlyPrice > 0;
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

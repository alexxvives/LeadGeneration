import Stripe from "stripe";
import { env } from "@/lib/config";
import { PLANS } from "@/lib/plans";
import type { PlanId } from "@/lib/types";

/**
 * Stripe client + helpers. All Stripe access is server-side only; the secret
 * key never reaches the client (constitution Art. III.5 / hard-constraint 3).
 * Price IDs are read from env via config.ts, never hard-coded.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = env.stripeSecretKey();
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  if (!client) client = new Stripe(key);
  return client;
}

/** The Stripe monthly Price ID configured for a plan, or null (e.g. Free). */
export function priceIdForPlan(planId: PlanId): string | null {
  const envName = PLANS[planId]?.stripePriceEnv;
  if (!envName) return null;
  const ids = env.stripePriceIds();
  return ids[planId as keyof typeof ids] ?? null;
}

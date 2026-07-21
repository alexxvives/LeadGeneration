import Stripe from "stripe";
import { env } from "@/lib/config";
import { PLANS } from "@/lib/plans";
import type { PlanId, Workspace } from "@/lib/types";

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

/**
 * Best-effort: cancel an active Stripe subscription before wiping a workspace.
 * Missing key / already-canceled / missing sub are non-fatal so local delete
 * still completes (GDPR wipe must not block on billing API).
 */
export async function cancelWorkspaceBilling(
  ws: Pick<Workspace, "stripeSubscriptionId" | "stripeCustomerId">,
): Promise<void> {
  if (!env.stripeSecretKey()) return;
  const subId = ws.stripeSubscriptionId?.trim();
  if (!subId) return;
  try {
    const stripe = getStripe();
    await stripe.subscriptions.cancel(subId);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "resource_missing") return;
    console.error(
      "[billing] cancelWorkspaceBilling failed",
      subId,
      ws.stripeCustomerId,
      err,
    );
  }
}

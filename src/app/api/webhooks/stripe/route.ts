import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { getD1Binding } from "@/lib/cf";
import { getDb } from "@/lib/db";
import { env } from "@/lib/config";
import { planIdForPriceId } from "@/lib/plans";
import { nowIso } from "@/lib/id";
import type { PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Public (no session) — authenticity comes from the
 * Stripe-Signature header, verified against STRIPE_WEBHOOK_SECRET. We read the
 * RAW request body (App Router `req.text()` — no body parsing to disable, unlike
 * the Pages Router) and use the async verifier so it works on Workers' Web
 * Crypto.
 *
 * Entitlement is set here (server-side, never trusting the client): we map the
 * subscription's price → planId and write it onto the workspace row.
 */
export async function POST(req: Request) {
  const secret = env.stripeWebhookSecret();
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const payload = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad signature";
    return NextResponse.json({ error: `Webhook signature failed: ${message}` }, { status: 400 });
  }

  const binding = await getD1Binding();
  const db = getDb(binding);
  const priceIds = env.stripePriceIds();

  async function applyPlan(
    customerId: string | null,
    planId: PlanId,
    subscriptionId: string | null,
    priceId: string | null,
  ): Promise<void> {
    if (!customerId) return;
    const ws = await db.getWorkspaceByStripeCustomer(customerId);
    if (!ws) return;
    await db.updateWorkspace(ws.id, {
      planId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      updatedAt: nowIso(),
    });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = (session.customer as string) ?? null;
      const subscriptionId = (session.subscription as string) ?? null;
      let priceId: string | null = null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        priceId = sub.items.data[0]?.price?.id ?? null;
      }
      const planId =
        planIdForPriceId(priceId, priceIds) ??
        (session.metadata?.planId as PlanId | undefined) ??
        "free";
      await applyPlan(customerId, planId, subscriptionId, priceId);
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price?.id ?? null;
      const planId = planIdForPriceId(priceId, priceIds) ?? "free";
      const active = sub.status === "active" || sub.status === "trialing";
      await applyPlan(
        sub.customer as string,
        active ? planId : "free",
        sub.id,
        active ? priceId : null,
      );
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await applyPlan(sub.customer as string, "free", null, null);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

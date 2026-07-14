import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { getStripe, priceIdForPlan } from "@/lib/billing/stripe";
import { env, authRequired } from "@/lib/config";
import { nowIso } from "@/lib/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CheckoutSchema = z.object({
  planId: z.enum(["starter", "pro", "agency"]),
});

/**
 * Create a Stripe Checkout session for the chosen plan and return its URL.
 * Requires an authenticated, metered workspace — billing is meaningless in
 * demo/local mode.
 */
export async function POST(req: Request) {
  if (!authRequired() || !env.stripeSecretKey()) {
    return NextResponse.json(
      { error: "Billing is not enabled in this environment." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = priceIdForPlan(parsed.data.planId);
  if (!priceId) {
    return NextResponse.json(
      { error: `No Stripe price configured for the ${parsed.data.planId} plan.` },
      { status: 400 },
    );
  }

  const ctx = await getCtx();
  const workspace = await ctx.db.getWorkspace(ctx.workspaceId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const stripe = getStripe();

  // Reuse or create the workspace's Stripe customer.
  let customerId = workspace.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: workspace.name,
      metadata: { workspaceId: workspace.id },
    });
    customerId = customer.id;
    await ctx.db.updateWorkspace(workspace.id, {
      stripeCustomerId: customerId,
      updatedAt: nowIso(),
    });
  }

  const appUrl = env.appUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // The webhook is the source of truth for entitlement; metadata lets us map
    // the resulting subscription back to a workspace defensively.
    subscription_data: { metadata: { workspaceId: workspace.id } },
    metadata: { workspaceId: workspace.id, planId: parsed.data.planId },
    success_url: `${appUrl}/app?upgraded=1`,
    cancel_url: `${appUrl}/pricing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}

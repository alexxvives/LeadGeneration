import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import { getStripe } from "@/lib/billing/stripe";
import { env, authRequired } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Open the Stripe Billing Portal for the current workspace's customer. */
export async function POST() {
  if (!authRequired() || !env.stripeSecretKey()) {
    return NextResponse.json(
      { error: "Billing is not enabled in this environment." },
      { status: 400 },
    );
  }

  const ctx = await getCtx();
  const workspace = await ctx.db.getWorkspace(ctx.workspaceId);
  if (!workspace?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account yet — upgrade to a paid plan first." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${env.appUrl()}/app/settings`,
  });

  return NextResponse.json({ url: session.url });
}

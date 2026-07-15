import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { setWorkspacePlanDev } from "@/lib/service";
import { PLAN_ORDER } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  planId: z.enum(["free", "starter", "pro", "agency"]),
});

/** TEMP developer endpoint — set workspace plan without Stripe. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `planId must be one of: ${PLAN_ORDER.join(", ")}` },
      { status: 400 },
    );
  }
  const ctx = await getCtx();
  await setWorkspacePlanDev(ctx, parsed.data.planId);
  return NextResponse.json({ ok: true, planId: parsed.data.planId });
}

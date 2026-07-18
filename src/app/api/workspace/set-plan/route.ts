import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminSession } from "@/lib/admin";
import { getCtx } from "@/lib/request-context";
import { setWorkspacePlanDev } from "@/lib/service";
import { PLAN_ORDER } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  planId: z.enum(["free", "starter", "pro", "agency"]),
});

/** Admin-only in production; open in local zero-key demo. */
export async function POST(req: Request) {
  const session = await auth().catch(() => null);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

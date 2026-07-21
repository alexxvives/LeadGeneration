import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminSession } from "@/lib/admin";
import { getCtx } from "@/lib/request-context";
import { setWorkspacePlanDev } from "@/lib/service";
import { ADMIN_PLAN_ORDER } from "@/lib/plans";
import { NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  planId: z.enum(["free", "starter", "pro", "agency", "insider"]),
  /** Optional — admin can gift a plan to another workspace. */
  workspaceId: z.string().min(1).optional(),
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
      { error: `planId must be one of: ${ADMIN_PLAN_ORDER.join(", ")}` },
      { status: 400 },
    );
  }
  const ctx = await getCtx();
  try {
    await setWorkspacePlanDev(
      ctx,
      parsed.data.planId,
      parsed.data.workspaceId,
    );
  } catch (e) {
    if (e instanceof NotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    throw e;
  }
  return NextResponse.json({
    ok: true,
    planId: parsed.data.planId,
    workspaceId: parsed.data.workspaceId ?? ctx.workspaceId,
  });
}

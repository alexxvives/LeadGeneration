import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminSession } from "@/lib/admin";
import { getCtx } from "@/lib/request-context";
import { resetWorkspaceUsage } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only in production; open in local zero-key demo. */
export async function POST() {
  const session = await auth().catch(() => null);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ctx = await getCtx();
  await resetWorkspaceUsage(ctx);
  return NextResponse.json({ ok: true });
}

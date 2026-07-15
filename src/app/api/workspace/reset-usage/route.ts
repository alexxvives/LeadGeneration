import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import { resetWorkspaceUsage } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** TEMP developer endpoint — zeros lead/send usage for the current workspace. */
export async function POST() {
  const ctx = await getCtx();
  await resetWorkspaceUsage(ctx);
  return NextResponse.json({ ok: true });
}

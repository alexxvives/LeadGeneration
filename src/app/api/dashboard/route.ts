import { NextResponse } from "next/server";
import { getCtx, getWorkspaceSummary } from "@/lib/request-context";
import { getDashboardStats } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getCtx();
  const stats = await getDashboardStats(ctx);
  const workspace = await getWorkspaceSummary(ctx);
  return NextResponse.json({ ...stats, workspace });
}

import { NextResponse } from "next/server";
import { getCtx, getWorkspaceSummary } from "@/lib/request-context";
import { getDashboardStats } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getCtx();
  const boardId = new URL(req.url).searchParams.get("boardId");
  const stats = await getDashboardStats(ctx, boardId);
  const workspace = await getWorkspaceSummary(ctx);
  return NextResponse.json({ ...stats, workspace });
}

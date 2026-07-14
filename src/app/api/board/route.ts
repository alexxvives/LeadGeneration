import { NextResponse } from "next/server";
import { getCtx, getWorkspaceSummary } from "@/lib/request-context";
import { getLatestBoard } from "@/lib/service";
import { getCapabilities } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getCtx();
  const board = await getLatestBoard(ctx);
  const workspace = await getWorkspaceSummary(ctx);
  return NextResponse.json({
    ...board,
    capabilities: getCapabilities(),
    workspace,
  });
}

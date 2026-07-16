import { NextResponse } from "next/server";
import { getCtx, getWorkspaceSummary } from "@/lib/request-context";
import { clearBoard, getLatestBoard } from "@/lib/service";
import { getCapabilities } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getCtx();
  const url = new URL(req.url);
  const boardParam = url.searchParams.get("boardId");
  const board = await getLatestBoard(ctx, boardParam);
  const workspace = await getWorkspaceSummary(ctx);
  const ws = await ctx.db.getWorkspace(ctx.workspaceId);
  const caps = getCapabilities();
  const canSendEmail =
    caps.canSendEmail ||
    !!ws?.resendApiKey?.trim() ||
    !!ws?.mailerooApiKey?.trim() ||
    !!ws?.connectedMailbox;
  // Effective verify = server key present AND workspace opted in.
  const emailVerify =
    caps.emailVerify && (ws?.emailVerifyEnabled !== false);
  return NextResponse.json({
    ...board,
    capabilities: { ...caps, canSendEmail, emailVerify },
    workspace,
  });
}

/** Clear all runs/leads/outreach for the current workspace. */
export async function DELETE() {
  const ctx = await getCtx();
  await clearBoard(ctx);
  return NextResponse.json({ ok: true });
}

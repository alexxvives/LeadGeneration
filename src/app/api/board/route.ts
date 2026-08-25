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
  const lite = url.searchParams.get("lite") === "1";
  const chunkOnly = url.searchParams.get("chunk") === "1";
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const perLaneRaw = url.searchParams.get("perLane");
  const laneOffsetRaw = url.searchParams.get("laneOffset");
  const leadLimit =
    limitRaw != null && limitRaw !== ""
      ? Math.max(0, Math.min(2000, Number.parseInt(limitRaw, 10) || 0))
      : undefined;
  const leadOffset =
    offsetRaw != null && offsetRaw !== ""
      ? Math.max(0, Number.parseInt(offsetRaw, 10) || 0)
      : 0;
  const leadPerLane =
    perLaneRaw != null && perLaneRaw !== ""
      ? Math.max(1, Math.min(200, Number.parseInt(perLaneRaw, 10) || 0))
      : undefined;
  const leadLaneOffset =
    laneOffsetRaw != null && laneOffsetRaw !== ""
      ? Math.max(0, Number.parseInt(laneOffsetRaw, 10) || 0)
      : 0;

  const board = await getLatestBoard(ctx, boardParam, {
    includeLeads: !lite,
    leadLimit: lite ? undefined : leadLimit,
    leadOffset: lite ? undefined : leadOffset,
    leadPerLane: lite ? undefined : leadPerLane,
    leadLaneOffset: lite ? undefined : leadLaneOffset,
    leadsOnly: chunkOnly && !lite,
  });

  // Background pages: leads only (client already has workspace/caps).
  if (chunkOnly && !lite) {
    return NextResponse.json({
      leads: board.leads,
      leadsTotal: board.leadsTotal,
      leadsHasMore: board.leadsHasMore,
      activeBoardId: board.activeBoardId,
    });
  }

  const workspace = await getWorkspaceSummary(ctx);
  // Client passes local-midnight ISO so “sent today” matches the user’s day.
  const dayStartRaw = url.searchParams.get("dayStart")?.trim() ?? "";
  const dayStart =
    dayStartRaw && !Number.isNaN(Date.parse(dayStartRaw))
      ? new Date(dayStartRaw).toISOString()
      : (() => {
          const d = new Date();
          d.setUTCHours(0, 0, 0, 0);
          return d.toISOString();
        })();
  const sendsToday = await ctx.db.countSentSince(dayStart, {
    boardId: board.activeBoardId,
  });
  const ws = await ctx.db.getWorkspace(ctx.workspaceId);
  const caps = getCapabilities();
  // Easy path only (Resend / Maileroo / SMTP / platform). Connected mailbox is
  // not a send transport while resolveSendPath() stays "easy".
  const canSendEmail =
    caps.canSendEmail ||
    !!ws?.resendApiKey?.trim() ||
    !!ws?.mailerooApiKey?.trim() ||
    !!(ws?.smtpHost?.trim() && ws?.smtpUser?.trim() && ws?.smtpPass);
  // Effective verify = server key + active board flag (ADR 0025).
  // “All boards” filter falls back to workspace default.
  const activeBoard = board.activeBoardId
    ? board.boards.find((b) => b.id === board.activeBoardId)
    : null;
  const boardVerifyOn = activeBoard
    ? activeBoard.emailVerifyEnabled !== false
    : ws?.emailVerifyEnabled !== false;
  const emailVerify = caps.emailVerify && boardVerifyOn;
  return NextResponse.json({
    ...board,
    capabilities: { ...caps, canSendEmail, emailVerify },
    workspace: {
      ...workspace,
      sendsToday,
      // Echo effective flag so Studio chrome matches the active board.
      emailVerifyEnabled: boardVerifyOn,
    },
  });
}

/** Clear all runs/leads/outreach for the current workspace. */
export async function DELETE() {
  const ctx = await getCtx();
  await clearBoard(ctx);
  return NextResponse.json({ ok: true });
}

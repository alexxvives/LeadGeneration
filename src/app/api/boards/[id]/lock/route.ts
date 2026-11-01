import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import { getBoardLockStatus, releaseBulkLock, renewBulkLock } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: the short bulk lock another user holds while an import, Find leads
 * run or bulk delete is running (null otherwise).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getCtx();
  const lock = await getBoardLockStatus(ctx, id);
  return NextResponse.json({ lock });
}

/**
 * POST {action:"renew"} — ~20s heartbeat from the tab running the action.
 * POST {action:"release"} — tab closing (sendBeacon / keepalive). Both only
 * ever touch the caller's OWN lock row; already-saved work stays saved.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getCtx();
  let action = "";
  try {
    // sendBeacon may post text/plain — parse the raw body.
    const body = JSON.parse((await req.text()) || "{}") as { action?: unknown };
    action = typeof body.action === "string" ? body.action : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (action === "renew") {
    return NextResponse.json({ ok: await renewBulkLock(ctx, id) });
  }
  if (action === "release") {
    await releaseBulkLock(ctx, id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

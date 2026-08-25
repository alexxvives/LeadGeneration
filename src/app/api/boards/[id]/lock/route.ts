import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import {
  getBoardLockStatus,
  heartbeatBoardLock,
  releaseBoardLock,
  takeoverBoardLock,
} from "@/lib/service";
import { isBoardLockedError, isNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getCtx();
  const lock = await getBoardLockStatus(ctx, id);
  return NextResponse.json({ lock });
}

/** Heartbeat — claim/refresh. 200 `{ acquired: false }` if someone else holds it. `{ takeover: true }` steals. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let takeover = false;
  try {
    const text = await req.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { takeover?: boolean };
      takeover = body.takeover === true;
    }
  } catch {
    takeover = false;
  }
  try {
    const ctx = await getCtx();
    if (takeover) {
      const lock = await takeoverBoardLock(ctx, id);
      return NextResponse.json({ lock, acquired: true });
    }
    const result = await heartbeatBoardLock(ctx, id);
    return NextResponse.json(result);
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json(
        {
          error: err.message,
          lock: {
            userId: err.holderUserId,
            userName: err.holderName,
          },
          acquired: false,
        },
        { status: 423 },
      );
    }
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Lock failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getCtx();
  await releaseBoardLock(ctx, id);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import {
  getBoardLockStatus,
  heartbeatBoardLock,
  releaseBoardLock,
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

/** Heartbeat — claim or refresh soft lock. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const ctx = await getCtx();
    const lock = await heartbeatBoardLock(ctx, id);
    return NextResponse.json({ lock });
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json(
        {
          error: err.message,
          lock: {
            userId: err.holderUserId,
            userName: err.holderName,
          },
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

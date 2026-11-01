import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import { getBoardLockStatus } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only: the short bulk lock another user holds while an import, Find
 * leads run or bulk delete is running (null otherwise). Locks are taken and
 * released server-side by those actions — there is no client heartbeat.
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

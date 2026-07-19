import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import {
  inviteToBoard,
  listBoardInvites,
  listBoardMembersForUi,
} from "@/lib/service";
import { isNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email().max(200),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const ctx = await getCtx();
    const [invites, members] = await Promise.all([
      listBoardInvites(ctx, id),
      listBoardMembersForUi(ctx, id),
    ]);
    return NextResponse.json({ invites, members });
  } catch (err) {
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  try {
    const ctx = await getCtx();
    const invite = await inviteToBoard(ctx, id, parsed.data.email);
    return NextResponse.json({ invite });
  } catch (err) {
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Invite failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

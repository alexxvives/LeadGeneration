import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { acceptBoardInvite, listMyPendingInvites } from "@/lib/service";
import { isNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getCtx();
  const invites = await listMyPendingInvites(ctx);
  return NextResponse.json({ invites });
}

const AcceptSchema = z.object({
  inviteId: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = AcceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "inviteId required" }, { status: 400 });
  }
  try {
    const ctx = await getCtx();
    const member = await acceptBoardInvite(ctx, parsed.data.inviteId);
    return NextResponse.json({ member });
  } catch (err) {
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Accept failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

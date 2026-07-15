import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import {
  disconnectMailbox,
  getMailboxStatus,
  updateMailboxWarmupProfile,
} from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — public mailbox status (no tokens). */
export async function GET() {
  const ctx = await getCtx();
  const mailbox = await getMailboxStatus(ctx);
  return NextResponse.json({ mailbox });
}

const PatchSchema = z.object({
  ageBand: z.enum(["new", "weeks", "months", "established"]).nullable().optional(),
  volumeBand: z.enum(["none", "light", "regular"]).nullable().optional(),
});

/** PATCH — update warmup self-report on connected mailbox. */
export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const ctx = await getCtx();
  const status = await getMailboxStatus(ctx);
  if (!status.connected) {
    return NextResponse.json({ error: "No mailbox connected" }, { status: 400 });
  }
  const mailbox = await updateMailboxWarmupProfile(ctx, parsed.data);
  return NextResponse.json({ mailbox });
}

/** DELETE — disconnect mailbox. */
export async function DELETE() {
  const ctx = await getCtx();
  await disconnectMailbox(ctx);
  return NextResponse.json({ ok: true });
}

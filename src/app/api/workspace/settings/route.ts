import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { updateWorkspaceEmailSettings } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  fromName: z.string().max(100).nullable().optional(),
  fromEmail: z.string().email().nullable().optional(),
  replyTo: z.string().email().nullable().optional(),
  physicalAddress: z.string().max(500).nullable().optional(),
  resendApiKey: z.string().max(200).nullable().optional(),
});

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
  await updateWorkspaceEmailSettings(ctx, parsed.data);
  return NextResponse.json({ ok: true });
}

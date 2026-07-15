import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { editOutreach, setOutreachDecision, setOutreachDeliveryStatus } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  subject: z.string().max(300).optional(),
  body: z.string().max(10000).optional(),
  toEmail: z.string().email().nullable().optional(),
  decision: z.enum(["approved", "rejected"]).optional(),
  deliveryStatus: z.enum(["unknown", "sent", "bounced", "replied"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { decision, deliveryStatus, ...edits } = parsed.data;
  const ctx = await getCtx();

  // Apply any content edits first, then the approve/reject decision.
  if (edits.subject !== undefined || edits.body !== undefined || edits.toEmail !== undefined) {
    const edited = await editOutreach(ctx, id, edits);
    if (!edited) return NextResponse.json({ error: "Outreach not found" }, { status: 404 });
  }

  if (decision) {
    const decided = await setOutreachDecision(ctx, id, decision);
    if (!decided) return NextResponse.json({ error: "Outreach not found" }, { status: 404 });
    return NextResponse.json({ outreach: decided });
  }

  if (deliveryStatus) {
    const updated = await setOutreachDeliveryStatus(ctx, id, deliveryStatus);
    if (!updated) return NextResponse.json({ error: "Outreach not found" }, { status: 404 });
    return NextResponse.json({ outreach: updated });
  }

  const current = await ctx.db.getOutreach(id);
  if (!current) return NextResponse.json({ error: "Outreach not found" }, { status: 404 });
  return NextResponse.json({ outreach: current });
}

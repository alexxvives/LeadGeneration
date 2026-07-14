import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { updateLeadCrm } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  crmStage: z
    .enum(["new", "contacted", "in_conversation", "closed", "not_interested"])
    .optional(),
  contactMethod: z.enum(["email", "phone", "contact_form"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  followUps: z
    .array(
      z.object({
        id: z.string(),
        date: z.string(),
        note: z.string(),
        done: z.boolean(),
      }),
    )
    .optional(),
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
      { error: "Invalid patch", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ctx = await getCtx();
  const lead = await updateLeadCrm(ctx, id, parsed.data);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

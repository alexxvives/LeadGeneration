import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { deleteLead, updateLeadCrm } from "@/lib/service";
import { isBoardLockedError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  crmStage: z
    .enum([
      "new",
      "contacted",
      "in_conversation",
      "closed",
      "not_interested",
    ])
    .optional(),
  contactMethods: z
    .array(z.enum(["email", "phone", "contact_form"]))
    .optional(),
  notes: z.string().nullable().optional(),
  companyType: z.string().max(120).nullable().optional(),
  company: z.string().min(1).max(200).optional(),
  website: z.string().max(500).nullable().optional(),
  emails: z.array(z.string().min(3).max(200)).max(10).optional(),
  phones: z.array(z.string().max(40)).max(5).optional(),
  location: z.string().max(400).nullable().optional(),
  aboutBlurb: z.string().max(2000).nullable().optional(),
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
  customFields: z.record(z.string(), z.string()).optional(),
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

  try {
    const ctx = await getCtx();
    const lead = await updateLeadCrm(ctx, id, parsed.data);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ lead });
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getCtx();
  const ok = await deleteLead(ctx, id);
  if (!ok) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

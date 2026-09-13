import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { deleteContact, updateContact } from "@/lib/service";
import { isBoardLockedError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  organization: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  location: z.string().max(400).nullable().optional(),
  followUps: z
    .array(
      z.object({
        id: z.string(),
        date: z.string(),
        note: z.string(),
        done: z.boolean(),
        kind: z.enum(["follow_up", "note", "email", "phone"]).optional(),
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

  try {
    const ctx = await getCtx();
    const contact = await updateContact(ctx, id, parsed.data);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ contact });
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    const message = err instanceof Error ? err.message : "Could not update contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const ctx = await getCtx();
    const ok = await deleteContact(ctx, id);
    if (!ok) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    throw err;
  }
}

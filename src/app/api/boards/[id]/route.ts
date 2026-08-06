import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { deleteBoard, updateBoard } from "@/lib/service";
import { isNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    outreachProfileId: z.string().min(1).max(80).nullable().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.outreachProfileId !== undefined,
    { message: "Nothing to update" },
  );

export async function PATCH(
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid patch" },
      { status: 400 },
    );
  }
  try {
    const ctx = await getCtx();
    const board = await updateBoard(ctx, id, parsed.data);
    return NextResponse.json({ board });
  } catch (err) {
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Failed to update board";
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
    await deleteBoard(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Failed to delete board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

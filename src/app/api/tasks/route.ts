import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { createTask, listTasks } from "@/lib/service";
import { isBoardLockedError, isNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  boardId: z.string().min(1).max(80).nullable().optional(),
  title: z.string().min(1).max(300),
  ownerUserId: z.string().max(80).nullable().optional(),
  ownerName: z.string().max(120).nullable().optional(),
  deadline: z.string().max(20).nullable().optional(),
  status: z
    .enum(["todo", "in_progress", "ongoing", "completed"])
    .optional(),
  leadId: z.string().max(80).nullable().optional(),
  contactId: z.string().max(80).nullable().optional(),
});

export async function GET(req: Request) {
  const ctx = await getCtx();
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  const tasks = await listTasks(ctx, boardId);
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ctx = await getCtx();
    const task = await createTask(ctx, {
      boardId: parsed.data.boardId ?? null,
      title: parsed.data.title,
      ownerUserId: parsed.data.ownerUserId,
      ownerName: parsed.data.ownerName,
      deadline: parsed.data.deadline,
      status: parsed.data.status,
      leadId: parsed.data.leadId,
      contactId: parsed.data.contactId,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Could not create task";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { createBoard, listBoardSummaries } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getCtx();
  const boards = await listBoardSummaries(ctx);
  return NextResponse.json({ boards });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Board name is required" }, { status: 400 });
  }
  try {
    const ctx = await getCtx();
    const board = await createBoard(ctx, parsed.data.name);
    return NextResponse.json({ board }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

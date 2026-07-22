import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { clearBoardLeads, deleteLeads } from "@/lib/service";

const Body = z.union([
  z.object({
    boardId: z.string().min(1),
  }),
  z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
  }),
]);

export async function POST(req: Request) {
  const ctx = await getCtx();
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid body",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  try {
    if ("boardId" in parsed.data) {
      const result = await clearBoardLeads(ctx, parsed.data.boardId);
      return NextResponse.json(result);
    }
    const result = await deleteLeads(ctx, parsed.data.ids);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    const status =
      message === "Board not found"
        ? 404
        : message.includes("working on this board")
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

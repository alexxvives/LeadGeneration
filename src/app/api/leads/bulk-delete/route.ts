import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { deleteLeads } from "@/lib/service";

const Body = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(req: Request) {
  const ctx = await getCtx();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const result = await deleteLeads(ctx, parsed.data.ids);
  return NextResponse.json(result);
}

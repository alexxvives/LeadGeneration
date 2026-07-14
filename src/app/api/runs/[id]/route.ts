import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import { getRunWithLeads } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getCtx();
  const result = await getRunWithLeads(ctx, id);
  if (!result) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json(result);
}

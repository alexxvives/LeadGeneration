import { NextResponse } from "next/server";
import { z } from "zod";
import { draftOutreach } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DraftSchema = z.object({ leadId: z.string().min(1) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const outreach = await draftOutreach(parsed.data.leadId);
  if (!outreach) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ outreach }, { status: 201 });
}

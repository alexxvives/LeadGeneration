import { NextResponse } from "next/server";
import { z } from "zod";
import { sendApprovedOutreach } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SendSchema = z.object({ outreachId: z.string().min(1) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "outreachId is required" }, { status: 400 });
  }

  const result = await sendApprovedOutreach(parsed.data.outreachId);
  if (!result.ok) {
    const status = result.rateLimited ? 429 : result.error?.includes("approved") ? 409 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

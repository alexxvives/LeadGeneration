import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { createAndRunSearch } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateRunSchema = z.object({
  niche: z.string().min(2, "Describe who you want to reach").max(200),
  location: z.string().max(120).optional().nullable(),
  offerNotes: z.string().max(1000).optional().nullable(),
  searchStrategy: z.enum(["standard", "smart", "local"]).optional(),
});

export async function GET() {
  const runs = await getDb().listRuns();
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const run = await createAndRunSearch(parsed.data);
  return NextResponse.json({ run }, { status: 201 });
}

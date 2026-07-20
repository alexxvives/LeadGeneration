import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import {
  createAndRunSearch,
  healStuckImportRuns,
  healStuckSearchRuns,
} from "@/lib/service";
import { isQuotaError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateRunSchema = z.object({
  niche: z.string().min(2, "Describe who you want to reach").max(200),
  location: z.string().max(120).optional().nullable(),
  offerNotes: z.string().max(4000).optional().nullable(),
  senderName: z.string().max(500).optional().nullable(),
  subjectTemplate: z.string().max(300).optional().nullable(),
  autoDraft: z.boolean().optional(),
  staticBody: z.boolean().optional(),
  aiPersonalize: z.boolean().optional(),
  searchStrategy: z.enum(["standard", "smart", "local"]).optional(),
  // Sync search runs inside one Worker request — hard-capped (audit C2.4).
  // TODO(queue): Cloudflare Queues / Durable Objects for larger batches.
  maxLeads: z.number().int().min(1).max(50).optional(),
  demo: z.boolean().optional(),
  boardId: z.string().min(1).max(80).optional().nullable(),
});

export async function GET() {
  const ctx = await getCtx();
  await healStuckImportRuns(ctx);
  await healStuckSearchRuns(ctx);
  const runs = await ctx.db.listRuns();
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

  try {
    const ctx = await getCtx();
    const run = await createAndRunSearch(ctx, parsed.data);
    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    if (isQuotaError(err)) {
      return NextResponse.json(
        { error: err.message, quota: { kind: err.kind, planId: err.planId, limit: err.limit } },
        { status: 402 },
      );
    }
    if (err instanceof Error && err.name === "SearchUnavailableError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

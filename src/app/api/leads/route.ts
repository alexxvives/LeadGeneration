import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { createManualLead, listLeadsInSteps } from "@/lib/service";
import {
  isBoardLockedError,
  isNotFoundError,
  isQuotaError,
} from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEP_IDS = [
  "evaluating_pre_demo",
  "waiting_on_demo",
  "evaluating_post_demo",
  "reviewing_contract",
  "onboarding",
] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const steps = (url.searchParams.get("steps") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is (typeof STEP_IDS)[number] =>
      (STEP_IDS as readonly string[]).includes(s),
    );
  if (steps.length === 0) {
    return NextResponse.json({ error: "steps required" }, { status: 400 });
  }
  const ctx = await getCtx();
  const leads = await listLeadsInSteps(ctx, url.searchParams.get("boardId"), steps);
  return NextResponse.json({ leads });
}

const BodySchema = z.object({
  boardId: z.string().min(1).max(80).optional().nullable(),
});

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ctx = await getCtx();
    const lead = await createManualLead(ctx, {
      boardId: parsed.data.boardId,
    });
    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    if (isQuotaError(err)) {
      return NextResponse.json(
        {
          error: err.message,
          quota: { kind: err.kind, planId: err.planId, limit: err.limit },
        },
        { status: 402 },
      );
    }
    if (isBoardLockedError(err)) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Could not create lead";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

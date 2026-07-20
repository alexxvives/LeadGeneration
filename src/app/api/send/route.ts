import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { sendApprovedOutreach } from "@/lib/service";
import { isAuthError, isQuotaError } from "@/lib/errors";

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

  try {
    const ctx = await getCtx();
    const result = await sendApprovedOutreach(ctx, parsed.data.outreachId);
    if (!result.ok) {
      const status = result.rateLimited
        ? 429
        : result.error?.includes("approved")
          ? 409
          : 400;
      return NextResponse.json(
        {
          ...result,
          // Surface cleanup flag so the client can show friendlier copy.
          undeliverableRemoved: result.undeliverableRemoved === true,
        },
        { status },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    if (isQuotaError(err)) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          quota: { kind: err.kind, planId: err.planId, limit: err.limit },
        },
        { status: 402 },
      );
    }
    throw err;
  }
}

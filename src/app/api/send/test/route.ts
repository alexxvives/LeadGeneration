import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { sendTestEmail } from "@/lib/service";
import { isAuthError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  to: z.string().min(3).max(254),
});

/**
 * POST /api/send/test — send a one-off test message to any address
 * so the user can verify Easy/Pro transport from Settings.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "to is required" }, { status: 400 });
  }

  try {
    const ctx = await getCtx();
    const result = await sendTestEmail(ctx, parsed.data.to);
    if (!result.ok) {
      const status = result.error?.toLowerCase().includes("rate limit")
        ? 429
        : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    throw err;
  }
}

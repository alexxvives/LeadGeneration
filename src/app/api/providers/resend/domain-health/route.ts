import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { env } from "@/lib/config";
import { fetchResendDomainHealth } from "@/lib/email/domain-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fromEmail: z.string().email().optional().nullable(),
});

/**
 * POST /api/providers/resend/domain-health
 * Thin route: resolve workspace Resend key → service helper → JSON.
 */
export async function POST(req: Request) {
  let fromEmail: string | null | undefined;
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    fromEmail = parsed.data.fromEmail;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const ctx = await getCtx();
    const ws = ctx.metered ? await ctx.db.getWorkspace(ctx.workspaceId) : null;
    const apiKey = ws?.resendApiKey?.trim() || env.resendKey() || null;
    const email = fromEmail || ws?.fromEmail || env.fromEmail();

    const health = await fetchResendDomainHealth({ apiKey, fromEmail: email });
    return NextResponse.json(health);
  } catch (err) {
    console.error("[domain-health]", err);
    // Still return a demo-safe payload so Settings never hard-fails.
    const health = await fetchResendDomainHealth({
      apiKey: null,
      fromEmail: fromEmail ?? env.fromEmail(),
    });
    return NextResponse.json(health);
  }
}

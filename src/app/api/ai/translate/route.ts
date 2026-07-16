import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { translateOutreachCopy } from "@/lib/ai/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  targetLang: z.enum(["en", "es", "fr", "it", "de", "pt", "pl"]),
  kind: z.enum(["subject", "body"]).optional(),
});

/**
 * POST /api/ai/translate — translate subject/body into a preview language.
 * Demo-safe: returns 503 when no AI provider is configured.
 */
export async function POST(req: Request) {
  try {
    await getCtx();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const result = await translateOutreachCopy(parsed.data);
    if (!result) {
      return NextResponse.json(
        { error: "No AI provider available to translate" },
        { status: 503 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const { isAuthError } = await import("@/lib/errors");
    if (isAuthError(err)) throw err;
    const message = err instanceof Error ? err.message : "Translate failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

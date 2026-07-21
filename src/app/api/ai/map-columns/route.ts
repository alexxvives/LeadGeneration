import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { mapImportColumns } from "@/lib/ai/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  headers: z.array(z.string().max(200)).min(1).max(80),
});

/**
 * POST /api/ai/map-columns — map spreadsheet headers to import fields.
 * Thin route → AI helper. Returns null mapping when AI is unavailable
 * (client falls back to alias matching for demo/zero-key).
 */
export async function POST(req: Request) {
  try {
    await getCtx();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid headers" }, { status: 400 });
    }
    const mapping = await mapImportColumns(parsed.data.headers);
    return NextResponse.json({ mapping });
  } catch (err) {
    const { isAuthError } = await import("@/lib/errors");
    if (isAuthError(err)) throw err;
    const message = err instanceof Error ? err.message : "Column mapping failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

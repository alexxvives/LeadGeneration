import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { generatePitchFromWebsite } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  website: z.string().min(3).max(400),
  companyName: z.string().max(200).optional(),
});

/**
 * POST /api/ai/pitch — generate default offer copy from a company website.
 * Thin route → service → Workers AI (optional; errors when unavailable).
 */
export async function POST(req: Request) {
  try {
    const ctx = await getCtx();
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid website" }, { status: 400 });
    }
    const result = await generatePitchFromWebsite(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const { isAuthError } = await import("@/lib/errors");
    if (isAuthError(err)) throw err;
    const message = err instanceof Error ? err.message : "Pitch generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

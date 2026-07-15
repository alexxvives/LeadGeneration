import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { importLeads } from "@/lib/service";
import { isQuotaError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RowSchema = z.object({
  company: z.string().max(200).optional().default(""),
  website: z.string().max(500).nullable().optional(),
  emails: z.array(z.string().min(3).max(200)).max(10).optional(),
  phones: z.array(z.string().max(40)).max(5).optional(),
  contactName: z.string().max(120).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
});

const BodySchema = z.object({
  leads: z.array(RowSchema).min(1).max(500),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
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
    const result = await importLeads(ctx, parsed.data.leads);
    return NextResponse.json(result);
  } catch (err) {
    if (isQuotaError(err)) {
      return NextResponse.json(
        { error: err.message, kind: err.kind, planId: err.planId },
        { status: 402 },
      );
    }
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

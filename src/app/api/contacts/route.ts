import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { createContact, listContacts } from "@/lib/service";
import { isBoardLockedError, isNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  boardId: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  organization: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  location: z.string().max(400).nullable().optional(),
});

export async function GET(req: Request) {
  const ctx = await getCtx();
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  const contacts = await listContacts(ctx, boardId);
  return NextResponse.json({ contacts });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ctx = await getCtx();
    const contact = await createContact(ctx, parsed.data);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Could not create contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

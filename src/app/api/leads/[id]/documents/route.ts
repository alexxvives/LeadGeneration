import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import { addLeadDocument, listLeadDocuments } from "@/lib/service";
import { isBoardLockedError, isNotFoundError } from "@/lib/errors";
import { LEAD_DOCUMENT_MAX_BYTES } from "@/lib/lead-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const ctx = await getCtx();
    const documents = await listLeadDocuments(ctx, id);
    return NextResponse.json({ documents });
  } catch (err) {
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > LEAD_DOCUMENT_MAX_BYTES) {
    return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 413 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const ctx = await getCtx();
    const document = await addLeadDocument(ctx, id, {
      name: file.name,
      mimeType: file.type,
      bytes,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Could not upload file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import { deleteLeadDocument, getLeadDocumentFile } from "@/lib/service";
import { isBoardLockedError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  const ctx = await getCtx();
  const file = await getLeadDocumentFile(ctx, id, docId);
  if (!file) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  const copy = new ArrayBuffer(file.bytes.byteLength);
  new Uint8Array(copy).set(file.bytes);
  return new NextResponse(copy, {
    headers: {
      "Content-Type": file.doc.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.doc.name.replace(/"/g, "")}"`,
      "Content-Length": String(file.bytes.byteLength),
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  try {
    const ctx = await getCtx();
    const ok = await deleteLeadDocument(ctx, id, docId);
    if (!ok) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isBoardLockedError(err)) {
      return NextResponse.json({ error: err.message }, { status: 423 });
    }
    throw err;
  }
}

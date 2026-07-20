import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import { updateWorkspaceEmailSettings } from "@/lib/service";
import { isAuthError, isNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emptyToNull = (v: unknown) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return typeof v === "string" ? v.trim() : v;
};

const optionalEmail = z.preprocess(
  emptyToNull,
  z.string().email().nullable().optional(),
);

const optionalKey = z.preprocess(
  emptyToNull,
  z.string().max(512).nullable().optional(),
);

const PatchSchema = z.object({
  fromName: z.preprocess(emptyToNull, z.string().max(100).nullable().optional()),
  fromEmail: optionalEmail,
  replyTo: optionalEmail,
  physicalAddress: z.preprocess(
    emptyToNull,
    z.string().max(500).nullable().optional(),
  ),
  resendApiKey: optionalKey,
  mailerooApiKey: optionalKey,
  easyEmailProvider: z.enum(["resend", "maileroo"]).optional(),
  preferredSendPath: z.enum(["easy", "pro"]).nullable().optional(),
  /** Zeruh list-hygiene at send (requires server verify key). */
  emailVerifyEnabled: z.boolean().optional(),
  /** When true, clear Resend key (explicit wipe). */
  clearResendApiKey: z.boolean().optional(),
  /** When true, clear Maileroo key (explicit wipe). */
  clearMailerooApiKey: z.boolean().optional(),
  /** Drafting profiles JSON (profiles + activeId). */
  outreachProfilesJson: z.string().max(200_000).nullable().optional(),
});

export async function GET() {
  try {
    const ctx = await getCtx();
    const ws = await ctx.db.getWorkspace(ctx.workspaceId);
    return NextResponse.json({
      outreachProfilesJson: ws?.outreachProfilesJson ?? null,
    });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldMsg = Object.entries(flat.fieldErrors)
      .map(([k, v]) => `${k}: ${(v ?? []).join(", ")}`)
      .filter((s) => !s.endsWith(": "))
      .join("; ");
    return NextResponse.json(
      {
        error: fieldMsg || "Validation failed",
        details: flat,
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const patch: Parameters<typeof updateWorkspaceEmailSettings>[1] = {};
  if (data.fromName !== undefined) patch.fromName = data.fromName;
  if (data.fromEmail !== undefined) patch.fromEmail = data.fromEmail;
  if (data.replyTo !== undefined) patch.replyTo = data.replyTo;
  if (data.physicalAddress !== undefined) patch.physicalAddress = data.physicalAddress;
  if (data.easyEmailProvider !== undefined) patch.easyEmailProvider = data.easyEmailProvider;
  if (data.preferredSendPath !== undefined) patch.preferredSendPath = data.preferredSendPath;
  if (data.emailVerifyEnabled !== undefined) {
    patch.emailVerifyEnabled = data.emailVerifyEnabled;
  }

  // Keys: only update when a new value is provided, or explicit clear flags.
  if (data.clearResendApiKey) patch.resendApiKey = null;
  else if (data.resendApiKey !== undefined && data.resendApiKey !== null) {
    patch.resendApiKey = data.resendApiKey;
  }
  if (data.clearMailerooApiKey) patch.mailerooApiKey = null;
  else if (data.mailerooApiKey !== undefined && data.mailerooApiKey !== null) {
    patch.mailerooApiKey = data.mailerooApiKey;
  }
  if (data.outreachProfilesJson !== undefined) {
    patch.outreachProfilesJson = data.outreachProfilesJson;
  }

  try {
    const ctx = await getCtx();
    await updateWorkspaceEmailSettings(ctx, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}

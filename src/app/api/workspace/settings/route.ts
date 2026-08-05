import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/request-context";
import {
  getPublicProfileSendSettings,
  updateWorkspaceEmailSettings,
} from "@/lib/service";
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
  /** Target outreach profile for Easy Sending identity. */
  profileId: z.string().min(1).max(64).optional(),
  /** Drop send settings when an outreach profile is deleted. */
  removeProfileSendSettings: z.string().min(1).max(64).optional(),
  /** Create an empty send-settings shell for a new profile. */
  ensureProfileSendSettings: z.string().min(1).max(64).optional(),
  fromName: z.preprocess(emptyToNull, z.string().max(100).nullable().optional()),
  fromEmail: optionalEmail,
  replyTo: optionalEmail,
  physicalAddress: z.preprocess(
    emptyToNull,
    z.string().max(500).nullable().optional(),
  ),
  resendApiKey: optionalKey,
  mailerooApiKey: optionalKey,
  smtpHost: z.preprocess(
    emptyToNull,
    z.string().max(253).nullable().optional(),
  ),
  smtpPort: z.preprocess((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : v;
  }, z.number().int().min(1).max(65535).nullable().optional()),
  smtpUser: z.preprocess(
    emptyToNull,
    z.string().max(254).nullable().optional(),
  ),
  smtpPass: optionalKey,
  easyEmailProvider: z.enum(["resend", "maileroo", "smtp"]).optional(),
  preferredSendPath: z.enum(["easy", "pro"]).nullable().optional(),
  /** MyEmailVerifier list-hygiene at send (requires server verify key). */
  emailVerifyEnabled: z.boolean().optional(),
  /** When true, clear Resend key (explicit wipe). */
  clearResendApiKey: z.boolean().optional(),
  /** When true, clear Maileroo key (explicit wipe). */
  clearMailerooApiKey: z.boolean().optional(),
  /** When true, clear SMTP password (host/user unchanged unless also patched). */
  clearSmtpPass: z.boolean().optional(),
  /** Drafting profiles JSON (profiles + activeId). */
  outreachProfilesJson: z.string().max(200_000).nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const ctx = await getCtx();
    const url = new URL(req.url);
    const profileId = url.searchParams.get("profileId");
    const data = await getPublicProfileSendSettings(ctx, profileId);
    return NextResponse.json({
      outreachProfilesJson: data.outreachProfilesJson,
      profileId: data.profileId,
      send: data.send,
      sendByProfile: data.sendByProfile,
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
  if (data.profileId !== undefined) patch.profileId = data.profileId;
  if (data.removeProfileSendSettings !== undefined) {
    patch.removeProfileSendSettings = data.removeProfileSendSettings;
  }
  if (data.ensureProfileSendSettings !== undefined) {
    patch.ensureProfileSendSettings = data.ensureProfileSendSettings;
  }
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
  if (data.smtpHost !== undefined) patch.smtpHost = data.smtpHost;
  if (data.smtpPort !== undefined) patch.smtpPort = data.smtpPort;
  if (data.smtpUser !== undefined) patch.smtpUser = data.smtpUser;
  if (data.clearSmtpPass) patch.smtpPass = null;
  else if (data.smtpPass !== undefined && data.smtpPass !== null) {
    patch.smtpPass = data.smtpPass;
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

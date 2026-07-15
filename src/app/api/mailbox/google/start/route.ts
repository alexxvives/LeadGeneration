import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCtx } from "@/lib/request-context";
import {
  googleMailboxAuthorizeUrl,
  googleMailboxRedirectUri,
  mailboxGoogleReady,
  signMailboxOAuthState,
} from "@/lib/email/mailbox";
import type { MailboxAgeBand, MailboxVolumeBand } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGE = new Set<MailboxAgeBand>(["new", "weeks", "months", "established"]);
const VOL = new Set<MailboxVolumeBand>(["none", "light", "regular"]);

/**
 * GET /api/mailbox/google/start
 * Signs CSRF state (workspace + optional warmup self-report) and redirects to Google.
 */
export async function GET(req: Request) {
  if (!mailboxGoogleReady()) {
    return NextResponse.json(
      { error: "Google mailbox OAuth is not configured on this server." },
      { status: 503 },
    );
  }

  const ctx = await getCtx();
  const url = new URL(req.url);
  const ageRaw = url.searchParams.get("ageBand");
  const volRaw = url.searchParams.get("volumeBand");
  const ageBand =
    ageRaw && AGE.has(ageRaw as MailboxAgeBand)
      ? (ageRaw as MailboxAgeBand)
      : undefined;
  const volumeBand =
    volRaw && VOL.has(volRaw as MailboxVolumeBand)
      ? (volRaw as MailboxVolumeBand)
      : undefined;

  const state = signMailboxOAuthState({
    workspaceId: ctx.workspaceId,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + 15 * 60 * 1000,
    ageBand,
    volumeBand,
  });

  const authorize = googleMailboxAuthorizeUrl({
    state,
    redirectUri: googleMailboxRedirectUri(),
  });
  if (!authorize) {
    return NextResponse.json({ error: "Could not build Google authorize URL" }, { status: 503 });
  }

  return NextResponse.redirect(authorize);
}

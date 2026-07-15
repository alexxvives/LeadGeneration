import { NextResponse } from "next/server";
import { getCtx } from "@/lib/request-context";
import { connectMailbox } from "@/lib/service";
import { env } from "@/lib/config";
import {
  buildConnectedMailbox,
  exchangeGoogleAuthCode,
  fetchGoogleMailboxEmail,
  verifyMailboxOAuthState,
} from "@/lib/email/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function settingsRedirect(query: Record<string, string>): NextResponse {
  const base = env.appUrl().replace(/\/$/, "");
  const url = new URL(`${base}/app/settings`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.hash = "sending-setup";
  return NextResponse.redirect(url);
}

/**
 * GET /api/mailbox/google/callback
 * Exchanges code → tokens, stores encrypted mailbox on workspace, redirects to Settings.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) {
    return settingsRedirect({ mailbox: "error", reason: err });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return settingsRedirect({ mailbox: "error", reason: "missing_code" });
  }

  const payload = verifyMailboxOAuthState(state);
  if (!payload) {
    return settingsRedirect({ mailbox: "error", reason: "invalid_state" });
  }

  const ctx = await getCtx();
  if (payload.workspaceId !== ctx.workspaceId) {
    // Local demo: getCtx always uses "local". Production: session must match signed state.
    return settingsRedirect({ mailbox: "error", reason: "workspace_mismatch" });
  }

  try {
    const tokens = await exchangeGoogleAuthCode(code);
    if (!tokens.refreshToken) {
      // Google only returns refresh_token on first consent — prompt=consent should force it.
      return settingsRedirect({ mailbox: "error", reason: "no_refresh_token" });
    }
    const email = await fetchGoogleMailboxEmail(tokens.accessToken);
    const mailbox = buildConnectedMailbox({
      email,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      ageBand: payload.ageBand ?? null,
      volumeBand: payload.volumeBand ?? null,
    });
    await connectMailbox(ctx, mailbox);
    return settingsRedirect({ mailbox: "connected" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_failed";
    console.error("[mailbox/google/callback]", msg);
    return settingsRedirect({ mailbox: "error", reason: "oauth_failed" });
  }
}

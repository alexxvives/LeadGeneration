/**
 * Pro mailbox send (ADR 0010) — Google behind sendEmail(); Microsoft later.
 *
 * Owns authorize URL, token exchange/refresh, Gmail send, and public status.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/config";
import { encryptSecret, decryptSecret } from "@/lib/email/token-crypto";
import { nowIso } from "@/lib/id";
import type {
  ConnectedMailbox,
  MailboxAgeBand,
  MailboxPublicStatus,
  MailboxVolumeBand,
  Workspace,
} from "@/lib/types";

export type MailboxProvider = "google" | "microsoft";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function mailboxGoogleReady(): boolean {
  return env.gmailOAuthConfigured();
}

export function googleMailboxRedirectUri(): string {
  const base = env.appUrl().replace(/\/$/, "");
  return `${base}/api/mailbox/google/callback`;
}

/** OAuth authorize URL for Gmail send. Returns null when not configured. */
export function googleMailboxAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
}): string | null {
  if (!mailboxGoogleReady()) return null;
  const params = new URLSearchParams({
    client_id: env.gmailOAuthClientId(),
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: ["openid", "email", "https://www.googleapis.com/auth/gmail.send"].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type OAuthStatePayload = {
  workspaceId: string;
  nonce: string;
  exp: number;
  ageBand?: MailboxAgeBand;
  volumeBand?: MailboxVolumeBand;
};

function stateHmac(body: string): string {
  return createHmac("sha256", env.authSecret()).update(body).digest("base64url");
}

export function signMailboxOAuthState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${stateHmac(body)}`;
}

export function verifyMailboxOAuthState(state: string): OAuthStatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = stateHmac(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
    if (!parsed.workspaceId || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function exchangeGoogleAuthCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.gmailOAuthClientId(),
      client_secret: env.gmailOAuthClientSecret(),
      redirect_uri: googleMailboxRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token exchange failed");
  }
  const expiresAt = new Date(
    Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  ).toISOString();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt,
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: string;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.gmailOAuthClientId(),
      client_secret: env.gmailOAuthClientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token refresh failed");
  }
  const expiresAt = new Date(
    Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  ).toISOString();
  return { accessToken: data.access_token, expiresAt };
}

export async function fetchGoogleMailboxEmail(accessToken: string): Promise<string> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as { email?: string; error?: { message?: string } };
  if (!res.ok || !data.email) {
    throw new Error(data.error?.message || "Could not read Google account email");
  }
  return data.email;
}

export function buildConnectedMailbox(opts: {
  email: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: string;
  ageBand?: MailboxAgeBand | null;
  volumeBand?: MailboxVolumeBand | null;
}): ConnectedMailbox {
  return {
    provider: "google",
    email: opts.email,
    refreshTokenEnc: encryptSecret(opts.refreshToken),
    accessTokenEnc: encryptSecret(opts.accessToken),
    accessTokenExpiresAt: opts.expiresAt,
    ageBand: opts.ageBand ?? null,
    volumeBand: opts.volumeBand ?? null,
    connectedAt: nowIso(),
  };
}

export function mailboxPublicStatus(ws: Workspace | null): MailboxPublicStatus {
  const m = ws?.connectedMailbox ?? null;
  return {
    connected: !!m,
    provider: m?.provider ?? null,
    email: m?.email ?? null,
    ageBand: m?.ageBand ?? null,
    volumeBand: m?.volumeBand ?? null,
    connectedAt: m?.connectedAt ?? null,
    googleReady: mailboxGoogleReady(),
    microsoftReady: false,
  };
}

function encodeRawMessage(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
  ];
  if (opts.replyTo) lines.push(`Reply-To: ${opts.replyTo}`);

  if (opts.html) {
    const boundary = `hermes_${Date.now().toString(36)}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, "");
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"', "");
    lines.push(opts.body);
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"', "");
    lines.push(opts.html);
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"', "");
    lines.push(opts.body);
  }

  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send via Gmail API. Returns updated mailbox (rotated access token) when refresh ran.
 */
export async function sendViaGmail(opts: {
  mailbox: ConnectedMailbox;
  to: string;
  subject: string;
  body: string;
  html?: string;
  fromName: string;
  replyTo?: string;
}): Promise<{ ok: true; id: string; mailbox: ConnectedMailbox } | { ok: false; error: string }> {
  let mailbox = opts.mailbox;
  let accessToken: string;
  try {
    const needsRefresh =
      !mailbox.accessTokenEnc ||
      !mailbox.accessTokenExpiresAt ||
      Date.parse(mailbox.accessTokenExpiresAt) < Date.now() + 60_000;
    if (needsRefresh) {
      const refresh = decryptSecret(mailbox.refreshTokenEnc);
      const next = await refreshGoogleAccessToken(refresh);
      mailbox = {
        ...mailbox,
        accessTokenEnc: encryptSecret(next.accessToken),
        accessTokenExpiresAt: next.expiresAt,
      };
      accessToken = next.accessToken;
    } else {
      accessToken = decryptSecret(mailbox.accessTokenEnc!);
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Mailbox token invalid — reconnect Google",
    };
  }

  const from = `${opts.fromName} <${mailbox.email}>`;
  const raw = encodeRawMessage({
    from,
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    html: opts.html,
    replyTo: opts.replyTo,
  });

  try {
    const res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    const data = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok) {
      return { ok: false, error: data.error?.message || `Gmail send failed (${res.status})` };
    }
    return { ok: true, id: data.id ?? `gmail_${Date.now()}`, mailbox };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

import { env, getCapabilities } from "@/lib/config";
import { sendViaGmail } from "@/lib/email/mailbox";
import { sendViaMaileroo } from "@/lib/email/maileroo";
import type { ConnectedMailbox, EasyEmailProvider } from "@/lib/types";

export interface SendInput {
  to: string;
  subject: string;
  body: string; // plain text (with {{unsubscribe_url}} placeholder)
  /** Resend tags for webhook → workspace/outreach matching. */
  tags?: Array<{ name: string; value: string }>;
}

/**
 * Per-workspace email identity overrides. All fields are optional — they fall
 * back to the platform env vars (OUTREACH_FROM_NAME etc.) when absent.
 * Populated from the workspace row fetched by the service layer at send time.
 */
export interface WorkspaceEmailSettings {
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  physicalAddress?: string | null;
  /** User's own Resend API key (custom domain). */
  resendApiKey?: string | null;
  /** User's own Maileroo sending key (custom domain). */
  mailerooApiKey?: string | null;
  /** Preferred Easy provider when both keys could exist. */
  easyEmailProvider?: EasyEmailProvider | null;
  /** Settings tab: Easy vs Pro. Google only when `"pro"`. */
  preferredSendPath?: "easy" | "pro" | null;
  /** Pro path — connected Google/Microsoft mailbox (ADR 0010). */
  connectedMailbox?: ConnectedMailbox | null;
}

export interface SendResult {
  ok: boolean;
  provider: "google" | "resend" | "maileroo" | "smtp" | "demo";
  id?: string;
  error?: string;
  /** Updated mailbox after token refresh — caller should persist. */
  connectedMailbox?: ConnectedMailbox;
}

function finalizeBody(body: string, replyToOrFrom: string): string {
  const mailto = `mailto:${replyToOrFrom}?subject=unsubscribe`;
  return body.replace(/\{\{unsubscribe_url\}\}/g, mailto);
}

async function sendWithResendKey(
  apiKey: string,
  opts: {
    from: string;
    to: string;
    subject: string;
    body: string;
    replyTo?: string;
    tags?: Array<{ name: string; value: string }>;
  },
): Promise<SendResult> {
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.body,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts.tags ? { tags: opts.tags } : {}),
    });
    if (error) return { ok: false, provider: "resend", error: error.message };
    return { ok: true, provider: "resend", id: data?.id };
  } catch (err) {
    return { ok: false, provider: "resend", error: errMsg(err) };
  }
}

function resolveSendPath(ws?: WorkspaceEmailSettings): "easy" | "pro" {
  if (ws?.preferredSendPath === "easy" || ws?.preferredSendPath === "pro") {
    return ws.preferredSendPath;
  }
  // Default: Pro when a mailbox is linked, otherwise Easy.
  if (ws?.connectedMailbox?.provider === "google" && ws.connectedMailbox.refreshTokenEnc) {
    return "pro";
  }
  return "easy";
}

/**
 * Send a single already-approved email.
 *
 * Priority depends on Settings preferred path:
 *   • Pro → Google mailbox first (when connected), then workspace Easy key
 *   • Easy → workspace Resend or Maileroo only (selected provider; no cross-fallback)
 * Then (no workspace Easy key): platform Resend → SMTP → demo.
 *
 * Workspace identity (fromName, fromEmail etc.) overrides env vars so each
 * workspace's outreach appears to come from its own representative.
 * Google sends always use the connected mailbox email as From.
 */
export async function sendEmail(
  input: SendInput,
  ws?: WorkspaceEmailSettings,
): Promise<SendResult> {
  const caps = getCapabilities();

  const fromName = ws?.fromName || env.fromName();
  const fromEmail = ws?.fromEmail || env.fromEmail();
  const replyTo = ws?.replyTo || env.replyTo();
  const body = finalizeBody(input.body, replyTo || fromEmail);
  const from = `${fromName} <${fromEmail}>`;
  const replyToHeader = replyTo || undefined;
  const tags = input.tags?.length ? input.tags : undefined;

  const path = resolveSendPath(ws);
  const mailbox = ws?.connectedMailbox;

  const tryGoogle = async (): Promise<SendResult | null> => {
    if (mailbox?.provider !== "google" || !mailbox.refreshTokenEnc) return null;
    const result = await sendViaGmail({
      mailbox,
      to: input.to,
      subject: input.subject,
      body,
      fromName,
      replyTo: replyToHeader,
    });
    if (!result.ok) return { ok: false, provider: "google", error: result.error };
    return {
      ok: true,
      provider: "google",
      id: result.id,
      connectedMailbox: result.mailbox,
    };
  };

  const wsResendKey = ws?.resendApiKey?.trim() || "";
  const wsMailerooKey = ws?.mailerooApiKey?.trim() || "";
  const preferred: EasyEmailProvider =
    ws?.easyEmailProvider === "maileroo" ? "maileroo" : "resend";

  const tryMaileroo = async (): Promise<SendResult | null> => {
    if (!wsMailerooKey) return null;
    const tagMap: Record<string, string> = {};
    for (const t of tags ?? []) {
      if (t.name && t.value) tagMap[t.name] = t.value;
    }
    const result = await sendViaMaileroo({
      apiKey: wsMailerooKey,
      fromName,
      fromEmail,
      to: input.to,
      subject: input.subject,
      body,
      replyTo: replyToHeader,
      tags: Object.keys(tagMap).length ? tagMap : undefined,
    });
    if (!result.ok) return { ok: false, provider: "maileroo", error: result.error };
    return { ok: true, provider: "maileroo", id: result.id };
  };

  const tryResend = async (): Promise<SendResult | null> => {
    if (!wsResendKey) return null;
    return sendWithResendKey(wsResendKey, {
      from,
      to: input.to,
      subject: input.subject,
      body,
      replyTo: replyToHeader,
      tags,
    });
  };

  /**
   * Easy BYO: use the selected provider when its key exists.
   * Do not cross-fallback to the other provider on failure — that surfaces
   * Resend domain errors while the user has Maileroo selected (and vice versa).
   * Only try the other key if the preferred key is missing.
   */
  const tryEasyKeys = async (): Promise<SendResult | null> => {
    if (preferred === "maileroo") {
      if (wsMailerooKey) return tryMaileroo();
      if (wsResendKey) return tryResend();
      return null;
    }
    if (wsResendKey) return tryResend();
    if (wsMailerooKey) return tryMaileroo();
    return null;
  };

  let proGoogleFail: SendResult | null = null;

  if (path === "pro") {
    const g = await tryGoogle();
    if (g?.ok) return g;
    if (g && !g.ok) proGoogleFail = g;
    const easy = await tryEasyKeys();
    if (easy) return easy; // success or BYO failure
  } else {
    const easy = await tryEasyKeys();
    // Return BYO success or failure — never fall through to platform Resend
    // when the user configured Easy (would show Resend "domain not verified").
    if (easy) return easy;
    // Easy path does not auto-use Google (user chose Easy in Settings).
  }

  // Platform Resend — only when no workspace Easy key is configured.
  if (caps.resend) {
    return sendWithResendKey(env.resendKey(), {
      from,
      to: input.to,
      subject: input.subject,
      body,
      replyTo: replyToHeader,
      tags,
    });
  }

  // Platform SMTP (self-hosted fallback — Maileroo, SES, Postfix, etc.).
  if (caps.smtp) {
    try {
      const nodemailer = await import("nodemailer");
      const { host, port, user, pass } = env.smtp();
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      const info = await transport.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: body,
        ...(replyToHeader ? { replyTo: replyToHeader } : {}),
      });
      return { ok: true, provider: "smtp", id: info.messageId };
    } catch (err) {
      return { ok: false, provider: "smtp", error: errMsg(err) };
    }
  }

  if (proGoogleFail) return proGoogleFail;

  // Demo mode — no provider configured.
  console.log(
    `[email:demo] Would send to ${input.to} — subject: "${input.subject}" (no provider configured)`,
  );
  return { ok: true, provider: "demo", id: `demo_${Date.now()}` };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { env, getCapabilities } from "@/lib/config";
import { sendViaGmail } from "@/lib/email/mailbox";
import { sendViaMaileroo } from "@/lib/email/maileroo";
import {
  looksLikeHtml,
  richToPlain,
  toEmailHtmlDocument,
} from "@/lib/outreach/rich-text";
import {
  normalizeEasyEmailProvider,
  type ConnectedMailbox,
  type EasyEmailProvider,
} from "@/lib/types";

export interface SendInput {
  to: string;
  subject: string;
  /** Plain or light HTML body (with {{unsubscribe_url}} placeholder). */
  body: string;
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
  /** BYO SMTP (Hostinger / Zoho / etc.) — Easy path. */
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
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

function bodyParts(body: string): { text: string; html?: string } {
  const text = richToPlain(body);
  if (!looksLikeHtml(body)) return { text };
  return { text, html: toEmailHtmlDocument(body) };
}

async function sendWithResendKey(
  apiKey: string,
  opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
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
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts.tags ? { tags: opts.tags } : {}),
    });
    if (error) return { ok: false, provider: "resend", error: error.message };
    return { ok: true, provider: "resend", id: data?.id };
  } catch (err) {
    return { ok: false, provider: "resend", error: errMsg(err) };
  }
}

/** Product send path is Easy-only (Resend / Maileroo / SMTP). Pro mailbox UI removed. */
function resolveSendPath(): "easy" | "pro" {
  return "easy";
}

/**
 * Send a single already-approved email.
 *
 * Easy path: workspace Resend / Maileroo / SMTP (selected provider; no
 * cross-fallback). Then (no workspace Easy key): platform Resend → SMTP → demo.
 *
 * Workspace identity (fromName, fromEmail etc.) overrides env vars so each
 * workspace's outreach appears to come from its own representative.
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
  const { text, html } = bodyParts(body);
  const from = `${fromName} <${fromEmail}>`;
  const replyToHeader = replyTo || undefined;
  const tags = input.tags?.length ? input.tags : undefined;

  const path = resolveSendPath();
  const mailbox = ws?.connectedMailbox;

  const tryGoogle = async (): Promise<SendResult | null> => {
    if (mailbox?.provider !== "google" || !mailbox.refreshTokenEnc) return null;
    const result = await sendViaGmail({
      mailbox,
      to: input.to,
      subject: input.subject,
      body: text,
      html,
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
  const wsSmtpHost = ws?.smtpHost?.trim() || "";
  const wsSmtpUser = ws?.smtpUser?.trim() || "";
  const wsSmtpPass = ws?.smtpPass ?? "";
  const wsSmtpReady = Boolean(wsSmtpHost && wsSmtpUser && wsSmtpPass);
  const preferred: EasyEmailProvider = normalizeEasyEmailProvider(
    ws?.easyEmailProvider,
  );

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
      body: text,
      html,
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
      text,
      html,
      replyTo: replyToHeader,
      tags,
    });
  };

  const tryWorkspaceSmtp = async (): Promise<SendResult | null> => {
    if (!wsSmtpReady) return null;
    const port =
      typeof ws?.smtpPort === "number" && ws.smtpPort > 0 ? ws.smtpPort : 465;
    return sendWithSmtp({
      host: wsSmtpHost,
      port,
      user: wsSmtpUser,
      pass: wsSmtpPass,
      from,
      to: input.to,
      subject: input.subject,
      text,
      html,
      replyTo: replyToHeader,
    });
  };

  /**
   * Easy BYO: use the selected provider when its credentials exist.
   * Do not cross-fallback on failure — that surfaces the wrong provider's
   * errors. Only try another transport if the preferred one is missing.
   */
  const tryEasyKeys = async (): Promise<SendResult | null> => {
    if (preferred === "smtp") {
      if (wsSmtpReady) return tryWorkspaceSmtp();
      if (wsResendKey) return tryResend();
      if (wsMailerooKey) return tryMaileroo();
      return null;
    }
    if (preferred === "maileroo") {
      if (wsMailerooKey) return tryMaileroo();
      if (wsResendKey) return tryResend();
      if (wsSmtpReady) return tryWorkspaceSmtp();
      return null;
    }
    if (wsResendKey) return tryResend();
    if (wsMailerooKey) return tryMaileroo();
    if (wsSmtpReady) return tryWorkspaceSmtp();
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
      text,
      html,
      replyTo: replyToHeader,
      tags,
    });
  }

  // Platform SMTP (self-hosted fallback — Maileroo, SES, Postfix, etc.).
  if (caps.smtp) {
    const { host, port, user, pass } = env.smtp();
    return sendWithSmtp({
      host,
      port,
      user,
      pass,
      from,
      to: input.to,
      subject: input.subject,
      text,
      html,
      replyTo: replyToHeader,
    });
  }

  if (proGoogleFail) return proGoogleFail;

  // Demo mode — no provider configured.
  console.log(
    `[email:demo] Would send to ${input.to} — subject: "${input.subject}" (no provider configured)`,
  );
  return { ok: true, provider: "demo", id: `demo_${Date.now()}` };
}

async function sendWithSmtp(opts: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<SendResult> {
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      auth: { user: opts.user, pass: opts.pass },
    });
    const info = await transport.sendMail({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    return { ok: true, provider: "smtp", id: info.messageId };
  } catch (err) {
    return { ok: false, provider: "smtp", error: errMsg(err) };
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

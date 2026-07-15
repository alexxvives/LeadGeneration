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

/**
 * Send a single already-approved email.
 *
 * Priority (first available wins):
 *   1. Connected Google mailbox     → Pro path (ADR 0010)
 *   2. Workspace Easy key (Resend or Maileroo — ADR 0011)
 *   3. Platform Resend key          → platform's Resend sending domain
 *   4. Platform SMTP                → fallback for self-hosted setups
 *   5. Demo mode                    → logs only, nothing is delivered
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

  // 1. Connected Google mailbox (Pro path).
  const mailbox = ws?.connectedMailbox;
  if (mailbox?.provider === "google" && mailbox.refreshTokenEnc) {
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
  }

  // 2. Workspace Easy keys (Resend / Maileroo). Prefer the chosen provider.
  const wsResendKey = ws?.resendApiKey?.trim() || "";
  const wsMailerooKey = ws?.mailerooApiKey?.trim() || "";
  const preferred: EasyEmailProvider =
    ws?.easyEmailProvider === "maileroo" ? "maileroo" : "resend";

  const tryMaileroo = async (): Promise<SendResult | null> => {
    if (!wsMailerooKey) return null;
    const result = await sendViaMaileroo({
      apiKey: wsMailerooKey,
      fromName,
      fromEmail,
      to: input.to,
      subject: input.subject,
      body,
      replyTo: replyToHeader,
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

  if (preferred === "maileroo") {
    const m = await tryMaileroo();
    if (m) return m;
    const r = await tryResend();
    if (r) return r;
  } else {
    const r = await tryResend();
    if (r) return r;
    const m = await tryMaileroo();
    if (m) return m;
  }

  // 3. Platform Resend key (primary — simple API key, no SMTP config needed).
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

  // 4. Platform SMTP (self-hosted fallback — Maileroo, SES, Postfix, etc.).
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

  // 5. Demo mode — no provider configured.
  console.log(
    `[email:demo] Would send to ${input.to} — subject: "${input.subject}" (no provider configured)`,
  );
  return { ok: true, provider: "demo", id: `demo_${Date.now()}` };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

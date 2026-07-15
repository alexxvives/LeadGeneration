import { env, getCapabilities } from "@/lib/config";
import { sendViaGmail } from "@/lib/email/mailbox";
import type { ConnectedMailbox } from "@/lib/types";

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
  /** User's own Resend API key (custom domain). Tried before the platform key. */
  resendApiKey?: string | null;
  /** Pro path — connected Google/Microsoft mailbox (ADR 0010). */
  connectedMailbox?: ConnectedMailbox | null;
}

export interface SendResult {
  ok: boolean;
  provider: "google" | "resend" | "smtp" | "demo";
  id?: string;
  error?: string;
  /** Updated mailbox after token refresh — caller should persist. */
  connectedMailbox?: ConnectedMailbox;
}

function finalizeBody(body: string, replyToOrFrom: string): string {
  const mailto = `mailto:${replyToOrFrom}?subject=unsubscribe`;
  return body.replace(/\{\{unsubscribe_url\}\}/g, mailto);
}

/**
 * Send a single already-approved email.
 *
 * Priority (first available wins):
 *   1. Connected Google mailbox     → Pro path (ADR 0010)
 *   2. Workspace's own Resend key   → custom domain, user's Resend account
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

  // 2. Workspace's own Resend key (custom domain).
  const wsResendKey = ws?.resendApiKey?.trim();
  if (wsResendKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(wsResendKey);
      const { data, error } = await resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        text: body,
        ...(replyToHeader ? { replyTo: replyToHeader } : {}),
        ...(tags ? { tags } : {}),
      });
      if (error) return { ok: false, provider: "resend", error: error.message };
      return { ok: true, provider: "resend", id: data?.id };
    } catch (err) {
      return { ok: false, provider: "resend", error: errMsg(err) };
    }
  }

  // 3. Platform Resend key (primary — simple API key, no SMTP config needed).
  if (caps.resend) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(env.resendKey());
      const { data, error } = await resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        text: body,
        ...(replyToHeader ? { replyTo: replyToHeader } : {}),
        ...(tags ? { tags } : {}),
      });
      if (error) return { ok: false, provider: "resend", error: error.message };
      return { ok: true, provider: "resend", id: data?.id };
    } catch (err) {
      return { ok: false, provider: "resend", error: errMsg(err) };
    }
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

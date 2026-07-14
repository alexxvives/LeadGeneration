import { env, getCapabilities } from "@/lib/config";

export interface SendInput {
  to: string;
  subject: string;
  body: string; // plain text (with {{unsubscribe_url}} placeholder)
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
}

export interface SendResult {
  ok: boolean;
  provider: "resend" | "smtp" | "demo";
  id?: string;
  error?: string;
}

function finalizeBody(body: string, replyToOrFrom: string): string {
  const mailto = `mailto:${replyToOrFrom}?subject=unsubscribe`;
  return body.replace(/\{\{unsubscribe_url\}\}/g, mailto);
}

/**
 * Send a single already-approved email.
 *
 * Priority (first available wins):
 *   1. Workspace's own Resend API key  → custom domain, user's Resend account
 *   2. Platform Resend key             → platform's Resend sending domain
 *   3. Platform SMTP                   → fallback for self-hosted setups
 *   4. Demo mode                       → logs only, nothing is delivered
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
  const from = `${fromName} <${fromEmail}>`;
  const replyToHeader = replyTo || undefined;

  // 1. Workspace's own Resend key (custom domain).
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
      });
      if (error) return { ok: false, provider: "resend", error: error.message };
      return { ok: true, provider: "resend", id: data?.id };
    } catch (err) {
      return { ok: false, provider: "resend", error: errMsg(err) };
    }
  }

  // 2. Platform Resend key (primary — simple API key, no SMTP config needed).
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
      });
      if (error) return { ok: false, provider: "resend", error: error.message };
      return { ok: true, provider: "resend", id: data?.id };
    } catch (err) {
      return { ok: false, provider: "resend", error: errMsg(err) };
    }
  }

  // 3. Platform SMTP (self-hosted fallback — Maileroo, SES, Postfix, etc.).
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

  // 4. Demo mode — no provider configured.
  console.log(
    `[email:demo] Would send to ${input.to} — subject: "${input.subject}" (no provider configured)`,
  );
  return { ok: true, provider: "demo", id: `demo_${Date.now()}` };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

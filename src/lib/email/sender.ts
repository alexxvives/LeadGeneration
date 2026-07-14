import { env, getCapabilities } from "@/lib/config";

export interface SendInput {
  to: string;
  subject: string;
  body: string; // plain text (with {{unsubscribe_url}} placeholder)
}

export interface SendResult {
  ok: boolean;
  provider: "resend" | "smtp" | "demo";
  id?: string;
  error?: string;
}

// Replace the unsubscribe placeholder just before send. In production this
// should point at a real, working one-click opt-out endpoint.
function finalizeBody(body: string): string {
  const base = env.replyTo() || env.fromEmail();
  const mailto = `mailto:${base}?subject=unsubscribe`;
  return body.replace(/\{\{unsubscribe_url\}\}/g, mailto);
}

/**
 * Send a single already-approved email. Chooses Resend, then SMTP; if neither
 * is configured it runs in DEMO mode and only logs (never actually sends).
 */
export async function sendEmail(input: SendInput): Promise<SendResult> {
  const caps = getCapabilities();
  const body = finalizeBody(input.body);
  const from = `${env.fromName()} <${env.fromEmail()}>`;

  if (caps.resend) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(env.resendKey());
      const { data, error } = await resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        text: body,
        ...(env.replyTo() ? { replyTo: env.replyTo() } : {}),
      });
      if (error) return { ok: false, provider: "resend", error: error.message };
      return { ok: true, provider: "resend", id: data?.id };
    } catch (err) {
      return { ok: false, provider: "resend", error: errMsg(err) };
    }
  }

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
        ...(env.replyTo() ? { replyTo: env.replyTo() } : {}),
      });
      return { ok: true, provider: "smtp", id: info.messageId };
    } catch (err) {
      return { ok: false, provider: "smtp", error: errMsg(err) };
    }
  }

  // DEMO mode: no provider configured. We intentionally do NOT send anything.
  console.log(
    `[email:demo] Would send to ${input.to} — subject: "${input.subject}" (no provider configured)`,
  );
  return { ok: true, provider: "demo", id: `demo_${Date.now()}` };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { env, getCapabilities } from "@/lib/config";
import { sendViaMaileroo } from "@/lib/email/maileroo";

/**
 * Best-effort transactional invite email via **platform** Resend / Maileroo / SMTP.
 * Never uses the workspace owner's BYO send keys — product mail only.
 * Does not throw — invite row is already persisted; mail is a courtesy.
 */
export async function sendBoardInviteEmail(opts: {
  to: string;
  boardName: string;
  inviterName: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const appUrl = env.appUrl().replace(/\/$/, "");
  const acceptUrl = `${appUrl}/app?view=boards`;
  const inviter = opts.inviterName?.trim() || "A teammate";
  const subject = `You're invited to “${opts.boardName}” on HERMES mail`;
  const text = [
    `${inviter} invited you to collaborate on the board “${opts.boardName}”.`,
    "",
    "Sign in with this email address, open Boards, and accept the invite.",
    acceptUrl,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0c1524">
  <p><strong>${escapeHtml(inviter)}</strong> invited you to collaborate on
  <strong>${escapeHtml(opts.boardName)}</strong> in HERMES mail.</p>
  <p>Sign in with <strong>${escapeHtml(opts.to)}</strong>, open
  <a href="${escapeHtml(acceptUrl)}">Boards</a>, and accept the invite.</p>
  <p style="margin-top:1.5rem"><a href="${escapeHtml(acceptUrl)}"
    style="display:inline-block;background:#0d9488;color:#fff;padding:0.65rem 1.25rem;border-radius:999px;text-decoration:none;font-weight:600">
    Open Boards</a></p>
</div>`;

  const from = env.authFromEmail();
  const fromParsed = parseFrom(from);
  const caps = getCapabilities();
  const resendKey = env.authResendKey() || env.resendKey();
  const mailerooKey = env.platformMailerooKey();

  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [opts.to],
          subject,
          html,
          text,
        }),
      });
      if (res.ok) return { sent: true };
      const body = await res.text().catch(() => "");
      console.error("[board-invite] Resend failed", res.status, body.slice(0, 200));
      // Fall through to Maileroo / SMTP — don't abort on Resend domain limits.
    } catch (err) {
      console.error("[board-invite] Resend error", err);
    }
  }

  if (mailerooKey) {
    const result = await sendViaMaileroo({
      apiKey: mailerooKey,
      fromName: fromParsed.name,
      fromEmail: fromParsed.email,
      to: opts.to,
      subject,
      body: text,
      html,
    });
    if (result.ok) return { sent: true };
    console.error("[board-invite] Maileroo failed", result.error);
  }

  const smtp = env.smtp();
  if (caps.smtp && smtp.host && smtp.user) {
    try {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      await transport.sendMail({ from, to: opts.to, subject, text, html });
      return { sent: true };
    } catch (err) {
      console.error("[board-invite] SMTP error", err);
      return { sent: false, error: err instanceof Error ? err.message : "SMTP error" };
    }
  }

  console.warn("[board-invite] No platform email provider configured — invite saved in-app only");
  return { sent: false, error: "No email provider" };
}

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    return {
      name: (m[1] || "HERMES mail").replace(/^["']|["']$/g, "").trim() || "HERMES mail",
      email: m[2]!.trim(),
    };
  }
  return { name: "HERMES mail", email: from.trim() || "onboarding@resend.dev" };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

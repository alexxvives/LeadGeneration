/**
 * Branded Auth.js magic-link email (HTML + plain text).
 * Colors match Lodestar: ink #060a12, aurora #43e0a8, mist text.
 */

export function magicLinkEmail(args: {
  url: string;
  host: string;
  email: string;
}): { html: string; text: string } {
  const { url, host, email } = args;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to Lodestar</title>
</head>
<body style="margin:0;padding:0;background:#060a12;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#060a12;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#0a1120;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px;background:radial-gradient(80% 120% at 10% 0%,rgba(67,224,168,0.18),transparent 55%),radial-gradient(70% 100% at 100% 0%,rgba(247,185,85,0.12),transparent 50%);">
              <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7ff2c8;">Lodestar</p>
              <h1 style="margin:12px 0 0;font-size:26px;line-height:1.2;font-weight:600;color:#eaf1fb;font-family:Georgia,'Times New Roman',serif;">
                Sign in to your studio
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;">
              <p style="margin:0;font-size:15px;line-height:1.55;color:#b6c4dc;">
                Use this secure link to open Lodestar as <strong style="color:#eaf1fb;">${escapeHtml(email)}</strong>. It expires soon and can only be used once.
              </p>
              <p style="margin:28px 0 0;">
                <a href="${escapeAttr(url)}" style="display:inline-block;background:#43e0a8;color:#060a12;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px;">
                  Open Lodestar
                </a>
              </p>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#7f92b3;">
                If the button doesn’t work, paste this URL into your browser:<br />
                <a href="${escapeAttr(url)}" style="color:#7ff2c8;word-break:break-all;">${escapeHtml(url)}</a>
              </p>
              <p style="margin:20px 0 0;font-size:12px;color:#7f92b3;">
                If you didn’t request this, you can ignore this email. — ${escapeHtml(host)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Sign in to Lodestar

Open this link to continue as ${email}:
${url}

If you didn’t request this, ignore this email.
— ${host}`;

  return { html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

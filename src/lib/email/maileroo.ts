/**
 * Maileroo Email API (BYO Easy send — ADR 0011).
 * Docs: POST https://smtp.maileroo.com/api/v2/emails
 */
export async function sendViaMaileroo(opts: {
  apiKey: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  /** Optional HTML alternative (bold/italic from pitch editor). */
  html?: string;
  replyTo?: string;
  /** Custom tags echoed on webhooks (leadify_ws / leadify_outreach). */
  tags?: Record<string, string>;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  try {
    const payload: Record<string, unknown> = {
      from: { address: opts.fromEmail, display_name: opts.fromName },
      to: [{ address: opts.to }],
      subject: opts.subject,
      plain: opts.body,
      ...(opts.html ? { html: opts.html } : {}),
    };
    if (opts.replyTo) {
      payload.reply_to = { address: opts.replyTo };
    }
    if (opts.tags && Object.keys(opts.tags).length > 0) {
      payload.tags = opts.tags;
    }

    const res = await fetch("https://smtp.maileroo.com/api/v2/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      /* non-JSON error body */
    }

    if (!res.ok) {
      const raw =
        (typeof json.message === "string" && json.message) ||
        (typeof json.error === "string" && json.error) ||
        text.slice(0, 200) ||
        `Maileroo HTTP ${res.status}`;
      // Wrong key pasted into Settings → Maileroo (e.g. a verify key) often
      // returns X-API-Key wording — point the user at the send key.
      const msg = /invalid api key|x-api-key/i.test(raw)
        ? `${raw} — Check Settings → Sending: Maileroo needs a Sending Key from your Maileroo domain (not a verify / MyEmailVerifier key).`
        : raw;
      return { ok: false, error: msg };
    }

    const data = (json.data as Record<string, unknown> | undefined) ?? json;
    const id =
      (typeof data.reference_id === "string" && data.reference_id) ||
      (typeof data.id === "string" && data.id) ||
      (typeof json.reference_id === "string" && json.reference_id) ||
      undefined;

    return { ok: true, id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

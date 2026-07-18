import { env } from "@/lib/config";

const RESEND_EVENTS = [
  "email.bounced",
  "email.complained",
  "email.delivered",
  "email.received",
] as const;

export interface EnsuredResendWebhook {
  id: string;
  signingSecret: string;
}

/**
 * Ensure a Resend account posts delivery events to Hermes.
 * Called when the user saves a BYO Resend API key — no dashboard setup.
 */
export async function ensureResendDeliveryWebhook(
  apiKey: string,
  opts?: { existingId?: string | null; existingSecret?: string | null },
): Promise<EnsuredResendWebhook | null> {
  const key = apiKey.trim();
  if (!key) return null;

  const endpoint = `${env.appUrl().replace(/\/$/, "")}/api/webhooks/resend`;

  // Already registered for this workspace — keep the stored signing secret.
  if (opts?.existingId && opts.existingSecret) {
    const stillThere = await listHasEndpoint(key, endpoint, opts.existingId);
    if (stillThere) {
      return { id: opts.existingId, signingSecret: opts.existingSecret };
    }
  }

  // Reuse an existing webhook on this Resend account pointing at us (secret
  // won't be returned on list — only recreate if we have no secret stored).
  const listed = await listWebhooks(key);
  const match = listed.find(
    (w) => normalizeUrl(w.endpoint) === normalizeUrl(endpoint),
  );
  if (match && opts?.existingSecret) {
    return { id: match.id, signingSecret: opts.existingSecret };
  }
  if (match && !opts?.existingSecret) {
    await deleteWebhook(key, match.id).catch(() => undefined);
  }

  const created = await createWebhook(key, endpoint);
  return created;
}

function normalizeUrl(u: string): string {
  return u.trim().replace(/\/$/, "").toLowerCase();
}

async function listWebhooks(
  apiKey: string,
): Promise<{ id: string; endpoint: string }[]> {
  const res = await fetch("https://api.resend.com/webhooks", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    data?: { id?: string; endpoint?: string }[];
  };
  return (body.data ?? [])
    .filter((w) => w.id && w.endpoint)
    .map((w) => ({ id: w.id!, endpoint: w.endpoint! }));
}

async function listHasEndpoint(
  apiKey: string,
  endpoint: string,
  id: string,
): Promise<boolean> {
  const listed = await listWebhooks(apiKey);
  return listed.some(
    (w) => w.id === id && normalizeUrl(w.endpoint) === normalizeUrl(endpoint),
  );
}

async function deleteWebhook(apiKey: string, id: string): Promise<void> {
  await fetch(`https://api.resend.com/webhooks/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

async function createWebhook(
  apiKey: string,
  endpoint: string,
): Promise<EnsuredResendWebhook | null> {
  const res = await fetch("https://api.resend.com/webhooks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint,
      events: [...RESEND_EVENTS],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[resend-webhooks] create failed", res.status, text.slice(0, 200));
    return null;
  }
  const body = (await res.json()) as {
    id?: string;
    signing_secret?: string;
  };
  if (!body.id || !body.signing_secret) return null;
  return { id: body.id, signingSecret: body.signing_secret };
}

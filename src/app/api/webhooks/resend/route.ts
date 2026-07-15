import { NextResponse } from "next/server";
import { getDb, LOCAL_WORKSPACE_ID } from "@/lib/db";
import { getD1Binding } from "@/lib/cf";
import { setOutreachDeliveryStatus, type Ctx } from "@/lib/service";
import type { DeliveryStatus } from "@/lib/types";
import { env } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend → Lodestar delivery webhooks.
 *
 * Configure in Resend Dashboard → Webhooks → URL:
 *   https://<your-host>/api/webhooks/resend
 * Events: email.bounced, email.complained, email.delivered, email.received
 *
 * Optional: RESEND_WEBHOOK_SECRET (Svix signing secret). When unset we accept
 * payloads in local/demo so zero-key mode still works; production should set it.
 *
 * Matching: by recipient email on the most recent sent outreach in the workspace.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const raw = await req.text();

  if (secret) {
    const ok = await verifySvix(raw, req.headers, secret);
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: {
    type?: string;
    data?: {
      to?: string[] | string;
      email_id?: string;
      from?: string;
    };
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type ?? "";
  const delivery = mapEvent(type);
  if (!delivery) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const toRaw = body.data?.to;
  const toList = Array.isArray(toRaw) ? toRaw : toRaw ? [toRaw] : [];
  const matchEmails =
    type === "email.received"
      ? [body.data?.from].filter(Boolean).map((s) => String(s).toLowerCase())
      : toList.map((s) => s.toLowerCase());

  if (matchEmails.length === 0) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const ctx = await webhookCtx();
  const all = await ctx.db.listOutreach();
  const candidates = all
    .filter((o) => o.status === "sent" && o.toEmail)
    .filter((o) => matchEmails.includes(o.toEmail!.toLowerCase()))
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

  const target = candidates[0];
  if (!target) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  await setOutreachDeliveryStatus(ctx, target.id, delivery);
  return NextResponse.json({ ok: true, matched: 1, outreachId: target.id, delivery });
}

function mapEvent(type: string): DeliveryStatus | null {
  switch (type) {
    case "email.bounced":
    case "email.complained":
    case "email.failed":
    case "email.suppressed":
      return "bounced";
    case "email.received":
      return "replied";
    case "email.delivered":
    case "email.sent":
      return "sent";
    default:
      return null;
  }
}

async function webhookCtx(): Promise<Ctx> {
  const binding = await getD1Binding();
  const probe = getDb(binding, LOCAL_WORKSPACE_ID);
  const runs = await probe.listRuns();
  const wsId = runs[0]?.workspaceId ?? LOCAL_WORKSPACE_ID;
  return {
    db: getDb(binding, wsId),
    workspaceId: wsId,
    metered: !!env.authSecret(),
  };
}

/** Minimal Svix-style verification (Resend webhooks). */
async function verifySvix(
  raw: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const msgId = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!msgId || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret);
  const toSign = `${msgId}.${timestamp}.${raw}`;
  const { createHmac } = await import("crypto");
  const expected = createHmac("sha256", key).update(toSign).digest("base64");
  const parts = signature.split(" ");
  for (const part of parts) {
    const [ver, sig] = part.split(",");
    if (ver === "v1" && sig === expected) return true;
  }
  return false;
}

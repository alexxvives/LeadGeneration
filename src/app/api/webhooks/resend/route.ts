import { NextResponse } from "next/server";
import { getDb, LOCAL_WORKSPACE_ID } from "@/lib/db";
import { getD1Binding } from "@/lib/cf";
import { setOutreachDeliveryStatus, type Ctx } from "@/lib/service";
import type { DeliveryStatus } from "@/lib/types";
import { authRequired, env } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendTag = { name?: string; value?: string };

/**
 * Resend → Hermes delivery webhooks.
 *
 * Signing secrets:
 *  - Per-workspace (auto-registered when the user saves a BYO Resend key)
 *  - Platform `RESEND_WEBHOOK_SECRET` (optional fallback for platform sends)
 *
 * Matching: tags `hermes_ws` / `leadify_ws` + outreach id. Email fallback only
 * for inbound replies after a signature verifies.
 */
export async function POST(req: Request) {
  const raw = await req.text();

  let body: {
    type?: string;
    data?: {
      to?: string[] | string;
      email_id?: string;
      from?: string;
      tags?: ResendTag[];
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

  const tags = body.data?.tags ?? [];
  const tagWs =
    tagValue(tags, "hermes_ws") ||
    tagValue(tags, "leadify_ws") ||
    tagValue(tags, "lodestar_ws");
  const tagOutreach =
    tagValue(tags, "hermes_outreach") ||
    tagValue(tags, "leadify_outreach") ||
    tagValue(tags, "lodestar_outreach");

  const binding = await getD1Binding();
  const probe = getDb(binding, LOCAL_WORKSPACE_ID);

  // Resolve which Svix secret to use (workspace auto-webhook, else platform).
  let verifySecret = env.resendWebhookSecret();
  if (tagWs) {
    const ws = await probe.getWorkspace(tagWs);
    if (ws?.resendWebhookSecret?.trim()) {
      verifySecret = ws.resendWebhookSecret.trim();
    }
  }

  if (authRequired() && !verifySecret) {
    return NextResponse.json(
      { error: "No webhook signing secret for this event" },
      { status: 503 },
    );
  }

  if (verifySecret) {
    const ok = await verifySvix(raw, req.headers, verifySecret);
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  if (tagWs && tagOutreach) {
    const ctx: Ctx = {
      db: getDb(binding, tagWs),
      workspaceId: tagWs,
      metered: !!binding,
    };
    const existing = await ctx.db.getOutreach(tagOutreach);
    if (existing) {
      await setOutreachDeliveryStatus(ctx, tagOutreach, delivery);
      return NextResponse.json({
        ok: true,
        matched: 1,
        via: "tags",
        outreachId: tagOutreach,
        delivery,
      });
    }
  }

  const allowEmailFallback =
    delivery === "replied" && (!!verifySecret || !authRequired());
  if (!allowEmailFallback) {
    return NextResponse.json({ ok: true, matched: 0 });
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

  const target = await probe.findLatestSentByEmail(matchEmails[0]!);
  if (!target) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const ctx: Ctx = {
    db: getDb(binding, target.workspaceId),
    workspaceId: target.workspaceId,
    metered: !!binding,
  };
  await setOutreachDeliveryStatus(ctx, target.id, delivery);
  return NextResponse.json({
    ok: true,
    matched: 1,
    via: "email",
    outreachId: target.id,
    delivery,
  });
}

function tagValue(tags: ResendTag[], name: string): string | null {
  const hit = tags.find((t) => t.name === name);
  const v = hit?.value?.trim();
  return v || null;
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

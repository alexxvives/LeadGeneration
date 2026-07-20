import { NextResponse } from "next/server";
import { getDb, LOCAL_WORKSPACE_ID } from "@/lib/db";
import { getD1Binding } from "@/lib/cf";
import { setOutreachDeliveryStatus, type Ctx } from "@/lib/service";
import type { DeliveryStatus } from "@/lib/types";
import { authRequired, env } from "@/lib/config";
import { timingSafeEqualString } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Maileroo → HERMES mail delivery + inbound webhooks.
 *
 * Matching: tags first (`hermes_*`, then `leadify_*` / `lodestar_*`);
 * email fallback only for inbound replies when the request is authenticated
 * (secret) or local demo. Production requires MAILEROO_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = env.mailerooWebhookSecret();

  if (authRequired() && !secret) {
    return NextResponse.json(
      { error: "MAILEROO_WEBHOOK_SECRET is required" },
      { status: 503 },
    );
  }

  if (secret) {
    const header =
      req.headers.get("x-maileroo-secret")?.trim() ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      "";
    if (!timingSafeEqualString(header, secret)) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }
  }

  let body: {
    event_type?: string;
    event_data?: { to?: string; reason?: string };
    tags?: Record<string, string> | null;
    message_reference_id?: string;
    envelope_sender?: string;
    message_id?: string;
    recipients?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inboundFrom = body.envelope_sender?.trim().toLowerCase() || null;
  const isInbound = !body.event_type && !!inboundFrom;
  const delivery: DeliveryStatus | null = isInbound
    ? "replied"
    : mapEvent(body.event_type ?? "");
  if (!delivery) {
    return NextResponse.json({ ok: true, ignored: body.event_type ?? null });
  }

  const tags = body.tags ?? {};
  const tagWs =
    (tags.hermes_ws ?? tags.leadify_ws ?? tags.lodestar_ws ?? "").trim() ||
    null;
  const tagOutreach =
    (
      tags.hermes_outreach ??
      tags.leadify_outreach ??
      tags.lodestar_outreach ??
      ""
    ).trim() || null;

  const binding = await getD1Binding();

  if (tagWs && tagOutreach) {
    const ctx: Ctx = {
      db: getDb(binding, tagWs),
      workspaceId: tagWs,
      metered: !!binding,
      userId: null,
      userEmail: null,
      userName: null,
      scopeToWorkspace: (wsId) => getDb(binding, wsId),
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
    (delivery === "replied" || isInbound) && (!!secret || !authRequired());
  if (!allowEmailFallback) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const matchEmail = isInbound
    ? inboundFrom
    : body.event_data?.to?.trim().toLowerCase() || null;
  if (!matchEmail) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const probe = getDb(binding, LOCAL_WORKSPACE_ID);
  const target = await probe.findLatestSentByEmail(matchEmail);
  if (!target) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const ctx: Ctx = {
    db: getDb(binding, target.workspaceId),
    workspaceId: target.workspaceId,
    metered: !!binding,
    userId: null,
    userEmail: null,
    userName: null,
    scopeToWorkspace: (wsId) => getDb(binding, wsId),
  };
  await setOutreachDeliveryStatus(ctx, target.id, delivery);
  return NextResponse.json({
    ok: true,
    matched: 1,
    via: isInbound ? "inbound" : "email",
    outreachId: target.id,
    delivery,
  });
}

function mapEvent(type: string): DeliveryStatus | null {
  switch (type) {
    case "failed":
    case "rejected":
    case "complained":
    case "bounced":
      return "bounced";
    case "delivered":
    case "accepted":
      return "sent";
    case "replied":
    case "reply":
    case "inbound":
      return "replied";
    default:
      return null;
  }
}

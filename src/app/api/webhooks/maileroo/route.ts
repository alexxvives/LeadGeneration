import { NextResponse } from "next/server";
import { getDb, LOCAL_WORKSPACE_ID } from "@/lib/db";
import { getD1Binding } from "@/lib/cf";
import { setOutreachDeliveryStatus, type Ctx } from "@/lib/service";
import type { DeliveryStatus } from "@/lib/types";
import { env } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Maileroo → Leadify delivery webhooks.
 *
 * Configure in Maileroo Dashboard → Events / Webhooks → URL:
 *   https://<your-host>/api/webhooks/maileroo
 * Events: delivered, failed, rejected, complained (opened/clicked ignored).
 *
 * Matching order:
 *   1. Tags `leadify_ws` + `leadify_outreach` (set on send; also accept legacy `lodestar_*`)
 *   2. Fallback: latest sent outreach by recipient email
 *
 * Optional: MAILEROO_WEBHOOK_SECRET — if set, require `X-Maileroo-Secret`
 * (or `Authorization: Bearer …`) to match. Unset = accept (demo-safe).
 */
export async function POST(req: Request) {
  const secret = process.env.MAILEROO_WEBHOOK_SECRET?.trim();
  if (secret) {
    const header =
      req.headers.get("x-maileroo-secret")?.trim() ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      "";
    if (header !== secret) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }
  }

  let body: {
    event_type?: string;
    event_data?: { to?: string; reason?: string };
    tags?: Record<string, string> | null;
    message_reference_id?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const delivery = mapEvent(body.event_type ?? "");
  if (!delivery) {
    return NextResponse.json({ ok: true, ignored: body.event_type ?? null });
  }

  const tags = body.tags ?? {};
  const tagWs =
    (tags.leadify_ws ?? tags.lodestar_ws ?? "").trim() || null;
  const tagOutreach =
    (tags.leadify_outreach ?? tags.lodestar_outreach ?? "").trim() || null;

  const binding = await getD1Binding();
  const probe = getDb(binding, LOCAL_WORKSPACE_ID);

  if (tagWs && tagOutreach) {
    const ctx: Ctx = {
      db: getDb(binding, tagWs),
      workspaceId: tagWs,
      metered: !!env.authSecret(),
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

  const to = body.event_data?.to?.trim().toLowerCase();
  if (!to) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const target = await probe.findLatestSentByEmail(to);
  if (!target) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const ctx: Ctx = {
    db: getDb(binding, target.workspaceId),
    workspaceId: target.workspaceId,
    metered: !!env.authSecret(),
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

function mapEvent(type: string): DeliveryStatus | null {
  switch (type) {
    case "failed":
    case "rejected":
    case "complained":
      return "bounced";
    case "delivered":
    case "accepted":
      return "sent";
    default:
      // opened / clicked / deferred — ignore for deliveryStatus
      return null;
  }
}

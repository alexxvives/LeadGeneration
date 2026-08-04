import { NextResponse } from "next/server";
import { getDb, LOCAL_WORKSPACE_ID } from "@/lib/db";
import { getD1Binding } from "@/lib/cf";
import { setOutreachDeliveryStatus, type Ctx } from "@/lib/service";
import type { DeliveryStatus } from "@/lib/types";
import { authRequired, env } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend → Hermes delivery webhooks.
 *
 * Signing secrets:
 *  - Per-workspace (auto-registered when the user saves a BYO Resend key)
 *  - Platform `RESEND_WEBHOOK_SECRET` (optional fallback for platform sends)
 *
 * Matching: tags `hermes_ws` / `leadify_ws` + outreach id. Email fallback for
 * replies + bounces after a signature verifies.
 *
 * Never return 503 for missing secrets — Resend auto-disables endpoints that
 * keep failing. Drop unverifiable events with 200 instead.
 *
 * Note: send API accepts tags as `{name,value}[]`, but webhook payloads expose
 * them as a flat object `{ [name]: value }` (see Resend bounce docs).
 */
export async function POST(req: Request) {
  const raw = await req.text();

  let body: {
    type?: string;
    data?: {
      to?: string[] | string;
      email_id?: string;
      from?: string;
      tags?: unknown;
    };
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    return await handleResendEvent(raw, req.headers, body);
  } catch (err) {
    // Never 5xx — Resend auto-disables endpoints that keep failing.
    console.error("[webhooks/resend] handler error", err);
    return NextResponse.json({ ok: true, ignored: "handler_error" });
  }
}

async function handleResendEvent(
  raw: string,
  headers: Headers,
  body: {
    type?: string;
    data?: {
      to?: string[] | string;
      email_id?: string;
      from?: string;
      tags?: unknown;
    };
  },
): Promise<NextResponse> {
  const type = body.type ?? "";
  const delivery = mapEvent(type);
  if (!delivery) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const tags = normalizeResendTags(body.data?.tags);
  const tagWs =
    tags.hermes_ws || tags.leadify_ws || tags.lodestar_ws || null;
  const tagOutreach =
    tags.hermes_outreach ||
    tags.leadify_outreach ||
    tags.lodestar_outreach ||
    null;

  const binding = await getD1Binding();
  const probe = getDb(binding, LOCAL_WORKSPACE_ID);

  // Candidate Svix secrets: workspace BYO first, platform as fallback.
  // When a BYO workspace secret verifies, email-fallback stays in that workspace.
  const platformSecret = env.resendWebhookSecret();
  const candidates: string[] = [];
  let secretWorkspaceId: string | null = null;
  if (tagWs) {
    const ws = await probe.getWorkspace(tagWs);
    if (ws?.resendWebhookSecret?.trim()) {
      candidates.push(ws.resendWebhookSecret.trim());
      secretWorkspaceId = tagWs;
    }
  }
  if (platformSecret && !candidates.includes(platformSecret)) {
    candidates.push(platformSecret);
  }

  let verified = !authRequired() && candidates.length === 0;
  if (candidates.length === 0) {
    if (authRequired()) {
      console.error("[webhooks/resend] no signing secret for event", {
        type,
        tagWs: tagWs ? "set" : null,
      });
      return NextResponse.json({ ok: true, ignored: "no_signing_secret" });
    }
  } else {
    for (const secret of candidates) {
      if (await verifySvix(raw, headers, secret)) {
        verified = true;
        break;
      }
    }
    if (!verified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

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
    (delivery === "replied" || delivery === "bounced") &&
    (verified || !authRequired());
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

  const target = await probe.findLatestSentByEmail(
    matchEmails[0]!,
    secretWorkspaceId ?? undefined,
  );
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
    via: "email",
    outreachId: target.id,
    delivery,
  });
}

/** Resend webhooks: object map. Legacy / send-shape: `{name,value}[]`. */
function normalizeResendTags(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const name = String((item as { name?: unknown }).name ?? "").trim();
      const value = String((item as { value?: unknown }).value ?? "").trim();
      if (name && value) out[name] = value;
    }
    return out;
  }
  if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
  }
  return out;
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

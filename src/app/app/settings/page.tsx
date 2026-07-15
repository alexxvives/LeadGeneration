import { env, getCapabilities } from "@/lib/config";
import { CheckIcon, XIcon, HelpIcon, SparkIcon } from "@/components/icons";
import { getCtx, getWorkspaceSummary } from "@/lib/request-context";
import { getPlan } from "@/lib/plans";
import type { Workspace } from "@/lib/types";
import { UsageBar } from "@/components/studio/UpgradeModal";
import { BillingActions } from "@/components/studio/BillingActions";
import { SenderProfileForm } from "@/components/studio/SenderProfileForm";
import { DeveloperModePanel } from "@/components/studio/DeveloperModePanel";
import { SendSetupPanel } from "@/components/studio/SendSetupPanel";
import {
  isPlaceholderAddress,
  isPlaceholderEmail,
  isPlaceholderName,
} from "@/lib/identity";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Settings: editable outreach profile + capability status.
// Secrets are never rendered in the UI.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caps = getCapabilities();
  const params = (await searchParams) ?? {};
  const mailboxFlag = typeof params.mailbox === "string" ? params.mailbox : null;

  let ctx: Awaited<ReturnType<typeof getCtx>>;
  let usage: Awaited<ReturnType<typeof getWorkspaceSummary>>;
  let ws: Workspace | null = null;
  try {
    ctx = await getCtx();
    usage = await getWorkspaceSummary(ctx);
    // Local JSON + prod D1 — always load so Easy settings + Pro mailbox persist in demo.
    ws = await ctx.db.getWorkspace(ctx.workspaceId);
  } catch (err) {
    console.error("[settings] getCtx failed", err);
    const { getDb, LOCAL_WORKSPACE_ID } = await import("@/lib/db");
    ctx = { db: getDb(undefined, LOCAL_WORKSPACE_ID), workspaceId: LOCAL_WORKSPACE_ID, metered: false };
    usage = await getWorkspaceSummary(ctx);
    ws = null;
  }
  const plan = getPlan(usage.planId);
  const { mailboxPublicStatus } = await import("@/lib/email/mailbox");
  const mailbox = mailboxPublicStatus(ws);

  const fromEmail = ws?.fromEmail || env.fromEmail();
  const fromName = ws?.fromName || env.fromName();
  const physicalAddress = ws?.physicalAddress || env.physicalAddress();

  const canSendEmail =
    caps.canSendEmail || !!ws?.resendApiKey?.trim() || !!ws?.connectedMailbox;

  const providers = [
    {
      name: "Web search",
      on: caps.firecrawl || caps.exa,
      desc: caps.firecrawl || caps.exa
        ? "Connected — searches find real companies on the web."
        : "Not connected — searches use sample leads until search is set up.",
    },
    {
      name: "Email delivery",
      on: canSendEmail,
      desc: canSendEmail
        ? ws?.connectedMailbox
          ? `Connected — sending via ${ws.connectedMailbox.provider} (${ws.connectedMailbox.email}).`
          : "Connected — approved messages can reach real inboxes."
        : "Not connected — approved messages stay inside the app.",
    },
  ];

  const defaultPath = mailboxFlag === "connected" || mailbox.connected ? "pro" : "easy";

  return (
    <main className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>

      {mailboxFlag === "connected" && (
        <p className="mt-4 rounded-lg border border-aurora-400/30 bg-aurora-400/10 px-4 py-3 text-sm text-mist-100">
          Google mailbox connected. Approved outreach can send from{" "}
          <span className="text-aurora-300">{mailbox.email ?? "your Gmail"}</span>.
        </p>
      )}
      {mailboxFlag === "error" && (
        <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-mist-100">
          Could not connect Google. Check redirect URI, test-user access, and try again
          (see docs/gmail-oauth-setup.md).
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Outreach profile
        </h2>
        <SenderProfileForm />
      </section>

      <section className="mt-8" data-tour="sending-setup" id="sending-setup">
        <SendSetupPanel
          canSendEmail={canSendEmail}
          canEdit={true}
          mailbox={mailbox}
          defaultPath={defaultPath}
          initial={{
            fromName: ws?.fromName ?? null,
            fromEmail: ws?.fromEmail ?? null,
            replyTo: ws?.replyTo ?? null,
            physicalAddress: ws?.physicalAddress ?? null,
            resendApiKey: ws?.resendApiKey ?? null,
          }}
          defaults={{
            fromName: env.fromName(),
            fromEmail: env.fromEmail(),
            replyTo: env.replyTo(),
            physicalAddress: env.physicalAddress(),
          }}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Developer mode
        </h2>
        <DeveloperModePanel metered currentPlanId={usage.planId} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Resources
        </h2>
        <div className="overflow-hidden rounded-xl2 border border-white/10">
          <Link
            href="/how-it-works"
            className="flex items-center gap-4 p-5 transition-colors hover:bg-white/[0.03]"
          >
            <HelpIcon className="h-5 w-5 shrink-0 text-mist-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">How it works</p>
              <p className="text-sm text-mist-500">Search, enrich, approve, send — the full walkthrough.</p>
            </div>
            <span className="text-mist-500">→</span>
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-4 border-t border-white/5 p-5 transition-colors hover:bg-white/[0.03]"
          >
            <SparkIcon className="h-5 w-5 shrink-0 text-mist-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Plans &amp; pricing</p>
              <p className="text-sm text-mist-500">Compare plans, upgrade, or manage your subscription.</p>
            </div>
            <span className="text-mist-500">→</span>
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Plan &amp; usage
        </h2>
        <div className="rounded-xl2 border border-white/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-xl font-semibold">{plan.name} plan</p>
              <p className="text-sm text-mist-500">
                {usage.metered
                  ? "Usage resets on the 1st of each month."
                  : "You’re on the local preview — open the live app to save sending details and use your plan."}
              </p>
            </div>
            {usage.metered && <BillingActions paid={usage.planId !== "free"} />}
          </div>
          {usage && (
            <div className="mt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <UsageBar label="Lead credits" used={usage.leadsUsed} limit={usage.leadsLimit} />
                <UsageBar label="Sends" used={usage.sendsUsed} limit={usage.sendsLimit} />
              </div>
              {!usage.metered && (
                <p className="mt-2 text-xs text-mist-500">
                  Local preview tracks usage for UX; hard caps apply on the live app.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Ready to send?
        </h2>
        <div className="overflow-hidden rounded-xl2 border border-white/10">
          {(
            [
              {
                ok: !isPlaceholderEmail(fromEmail),
                label: "From email",
                hint: "Set under Easy path — use an address on your verified domain",
              },
              {
                ok: !isPlaceholderName(fromName),
                label: "From name",
                hint: "Set under Easy path — how you appear in the inbox",
              },
              {
                ok: !isPlaceholderAddress(physicalAddress),
                label: "Mailing address",
                hint: "CAN-SPAM — appended only when the lead looks US-based",
              },
              {
                ok: caps.canSendEmail,
                label: "Email delivery",
                hint: "Resend or SMTP connected so approved messages can leave the app",
              },
              {
                ok: caps.canSearchLive,
                label: "Live search",
                hint: "Must be connected so searches find real companies",
              },
            ] as const
          ).map((item, i) => (
            <div
              key={item.label}
              className={`flex items-start gap-4 p-4 ${i > 0 ? "border-t border-white/5" : ""}`}
            >
              <StatusDot on={item.ok} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-mist-500">{item.hint}</p>
              </div>
            </div>
          ))}
          <div className="border-t border-white/5 px-4 py-3">
            <Link href="/deliverability" className="text-sm text-aurora-300 hover:underline">
              Full deliverability guide →
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Integrations
        </h2>
        <div className="overflow-hidden rounded-xl2 border border-white/10">
          {providers.map((p, i) => (
            <div
              key={p.name}
              className={`flex items-center gap-4 p-5 ${i > 0 ? "border-t border-white/5" : ""}`}
            >
              <StatusDot on={p.on} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-mist-500">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Advanced
        </h2>
        <div className="rounded-xl2 border border-white/10 p-5">
          <div className="flex items-center gap-4">
            <StatusDot on={env.contactFormAutomationEnabled()} />
            <div className="flex-1">
              <p className="font-medium">Contact-form automation</p>
              <p className="text-sm text-mist-500">
                Off by default. Even when on, it only simulates a form fill — never posts to a
                real site.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
        on ? "bg-aurora-400/15 text-aurora-300" : "bg-white/5 text-mist-500"
      }`}
    >
      {on ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
    </span>
  );
}

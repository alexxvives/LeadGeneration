import { env, getCapabilities } from "@/lib/config";
import { CheckIcon, XIcon, HelpIcon, SparkIcon } from "@/components/icons";
import { getCtx, getWorkspaceSummary } from "@/lib/request-context";
import { getPlan } from "@/lib/plans";
import type { Workspace } from "@/lib/types";
import { UsageBar } from "@/components/studio/UpgradeModal";
import { BillingActions } from "@/components/studio/BillingActions";
import { SenderProfileForm } from "@/components/studio/SenderProfileForm";
import { EmailSettingsForm } from "@/components/studio/EmailSettingsForm";
import { DeveloperModePanel } from "@/components/studio/DeveloperModePanel";
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
export default async function SettingsPage() {
  const caps = getCapabilities();

  let ctx: Awaited<ReturnType<typeof getCtx>>;
  let usage: Awaited<ReturnType<typeof getWorkspaceSummary>>;
  let ws: Workspace | null = null;
  try {
    ctx = await getCtx();
    usage = await getWorkspaceSummary(ctx);
    ws = ctx.metered ? await ctx.db.getWorkspace(ctx.workspaceId) : null;
  } catch (err) {
    console.error("[settings] getCtx failed", err);
    const { getDb, LOCAL_WORKSPACE_ID } = await import("@/lib/db");
    ctx = { db: getDb(undefined, LOCAL_WORKSPACE_ID), workspaceId: LOCAL_WORKSPACE_ID, metered: false };
    usage = await getWorkspaceSummary(ctx);
    ws = null;
  }
  const plan = getPlan(usage.planId);

  const fromEmail = ws?.fromEmail || env.fromEmail();
  const fromName = ws?.fromName || env.fromName();
  const physicalAddress = ws?.physicalAddress || env.physicalAddress();

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
      on: caps.canSendEmail,
      desc: caps.canSendEmail
        ? "Connected — approved messages can reach real inboxes."
        : "Not connected — approved messages stay inside the app.",
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Outreach profile
        </h2>
        <SenderProfileForm />
      </section>

      <section id="sending-identity" className="mt-8 scroll-mt-8" data-tour="sending-identity">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Sending identity
        </h2>
        <p className="mb-4 text-sm text-mist-500">
          This is who your emails come from. Fill these in before sending real outreach.
        </p>
        <div className="rounded-xl2 border border-white/10 p-5">
          <EmailSettingsForm
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
            canEdit={ctx.metered}
            liveAppUrl="https://leadgeneration.alexxvives.workers.dev/app/settings#sending-identity"
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Developer mode
        </h2>
        <DeveloperModePanel metered={usage.metered} />
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
          {usage.metered && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <UsageBar label="Lead credits" used={usage.leadsUsed} limit={usage.leadsLimit} />
              <UsageBar label="Sends" used={usage.sendsUsed} limit={usage.sendsLimit} />
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Email delivery
        </h2>
        <div className="rounded-xl2 border border-white/10 p-5">
          <p className="text-sm text-mist-300">
            Status of outbound email on this site. To send from your own domain, add it in{" "}
            <a
              href="https://resend.com/domains"
              target="_blank"
              rel="noopener noreferrer"
              className="text-aurora-300 hover:underline"
            >
              Resend → Domains
            </a>
            , finish DNS, then put that address under{" "}
            <a href="#sending-identity" className="text-aurora-300 hover:underline">
              Sending identity
            </a>
            .
          </p>
          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-ink-900/40 px-4 py-3">
              <StatusDot on={caps.canSendEmail} />
              <div>
                <p className="text-sm font-medium">
                  {caps.canSendEmail ? "Email delivery is on" : "Email delivery is off"}
                </p>
                <p className="text-xs text-mist-500">
                  {caps.canSendEmail
                    ? "Approved outreach can leave the app."
                    : "Approved messages won’t be delivered until delivery is connected."}
                </p>
              </div>
            </div>
          </div>
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
                hint: "Set under Sending identity — use an address on your verified domain",
              },
              {
                ok: !isPlaceholderName(fromName),
                label: "From name",
                hint: "Set under Sending identity — how you appear in the inbox",
              },
              {
                ok: !isPlaceholderAddress(physicalAddress),
                label: "Mailing address",
                hint: "Set under Sending identity — required on every commercial email",
              },
              {
                ok: caps.canSendEmail,
                label: "Email delivery",
                hint: "Must be connected so approved messages can reach inboxes",
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

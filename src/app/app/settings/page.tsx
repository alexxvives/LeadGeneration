import { env, getCapabilities } from "@/lib/config";
import { CheckIcon, XIcon, HelpIcon, SparkIcon } from "@/components/icons";
import { getCtx, getWorkspaceSummary } from "@/lib/request-context";
import { getPlan } from "@/lib/plans";
import { UsageBar } from "@/components/studio/UpgradeModal";
import { BillingActions } from "@/components/studio/BillingActions";
import { SenderProfileForm } from "@/components/studio/SenderProfileForm";
import { EmailSettingsForm } from "@/components/studio/EmailSettingsForm";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Settings: editable outreach profile (browser) + read-only env capability status.
// Secrets live in .env and are never rendered.
export default async function SettingsPage() {
  const caps = getCapabilities();
  const ctx = await getCtx();
  const usage = await getWorkspaceSummary(ctx);
  const ws = ctx.metered ? await ctx.db.getWorkspace(ctx.workspaceId) : null;
  const plan = getPlan(usage.planId);

  const providers = [
    {
      name: "Firecrawl",
      envVar: "FIRECRAWL_API_KEY",
      on: caps.firecrawl,
      desc: "Primary live search provider — web search + full-page scrape for enrichment.",
    },
    {
      name: "Exa",
      envVar: "EXA_API_KEY",
      on: caps.exa,
      desc: "Fallback search provider (used when Firecrawl key is absent). Either one is enough.",
    },
    {
      name: "SMTP / Maileroo",
      envVar: "SMTP_HOST + SMTP_USER + SMTP_PASS",
      on: caps.smtp,
      desc: "Email sending for approved outreach. Recommended: Maileroo (smtp.maileroo.com) with your own domain.",
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
              <p className="text-sm text-mist-500">The full product walkthrough — search, enrich, approve, send.</p>
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
                  ? "Usage is metered monthly and resets on the 1st."
                  : "Demo / local mode — unlimited and unmetered."}
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
          Connect domain / SMTP
        </h2>
        <div className="rounded-xl2 border border-white/10 p-5">
          <p className="text-sm text-mist-300">
            Sending identity and SMTP credentials are configured via environment variables so
            keys never hit the browser or the local JSON store. For production deliverability,
            use a dedicated warmed domain (Maileroo or similar).
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-mist-300">
            <li>
              Set <code className="text-aurora-300">SMTP_HOST</code>,{" "}
              <code className="text-aurora-300">SMTP_PORT</code>,{" "}
              <code className="text-aurora-300">SMTP_USER</code>,{" "}
              <code className="text-aurora-300">SMTP_PASS</code> in{" "}
              <code className="text-aurora-300">.env.local</code> (or Wrangler secrets).
            </li>
            <li>
              Set <code className="text-aurora-300">OUTREACH_FROM_EMAIL</code>,{" "}
              <code className="text-aurora-300">OUTREACH_FROM_NAME</code>, and{" "}
              <code className="text-aurora-300">OUTREACH_PHYSICAL_ADDRESS</code>.
            </li>
            <li>Restart the server (or redeploy) — status below updates automatically.</li>
          </ol>
          <p className="mt-4 text-sm">
            <Link href="/deliverability" className="text-aurora-300 hover:underline">
              Deliverability guide →
            </Link>
          </p>
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-white/5 bg-ink-900/40 px-4 py-3">
            <StatusDot on={caps.smtp} />
            <div>
              <p className="text-sm font-medium">
                {caps.smtp ? "SMTP connected" : "No SMTP configured"}
              </p>
              <p className="text-xs text-mist-500">
                {caps.canSendEmail
                  ? "Approved sends will be delivered from your domain."
                  : "Sends run in demo mode — configure SMTP above to go live."}
              </p>
            </div>
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
              <code className="hidden rounded bg-white/5 px-2 py-1 text-xs text-mist-300 sm:block">
                {p.envVar}
              </code>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-mist-500">
          {caps.canSearchLive
            ? "Live search is active."
            : "No search key detected — searches use built-in demo leads."}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Sending identity
        </h2>
        <p className="mb-4 text-sm text-mist-500">
          Every outbound email uses these values. Placeholders show the platform defaults
          (set via env vars); filling a field overrides it for your workspace only.
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
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Feature flags
        </h2>
        <div className="rounded-xl2 border border-white/10 p-5">
          <div className="flex items-center gap-4">
            <StatusDot on={env.contactFormAutomationEnabled()} />
            <div className="flex-1">
              <p className="font-medium">Contact-form automation</p>
              <p className="text-sm text-mist-500">
                Demo-only stub. OFF by default. Even when enabled it only simulates a
                submission and never posts to a real site.
              </p>
            </div>
            <code className="hidden rounded bg-white/5 px-2 py-1 text-xs text-mist-300 sm:block">
              ENABLE_CONTACT_FORM_AUTOMATION
            </code>
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


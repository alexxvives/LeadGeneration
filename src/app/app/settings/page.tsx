import { env, getCapabilities, authRequired } from "@/lib/config";
import { HelpIcon, SparkIcon } from "@/components/icons";
import { getCtx, getWorkspaceSummary } from "@/lib/request-context";
import { getPlan, isPaidPlan } from "@/lib/plans";
import type { Workspace } from "@/lib/types";
import { UsageBar } from "@/components/studio/UpgradeModal";
import { BillingActions } from "@/components/studio/BillingActions";
import { SenderProfileForm } from "@/components/studio/SenderProfileForm";
import { DeveloperModePanel } from "@/components/studio/DeveloperModePanel";
import { SendSetupPanel } from "@/components/studio/SendSetupPanel";
import { DeleteAccountPanel } from "@/components/studio/DeleteAccountPanel";
import { isAdminSession } from "@/lib/admin";
import { auth } from "@/auth";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Settings: editable outreach profile + capability status.
// API keys are never rendered — only has* flags reach the client.
// Platform admins get a slim ops-focused page (no studio send/profiles).
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
    ws = await ctx.db.getWorkspace(ctx.workspaceId);
  } catch (err) {
    const { isAuthError } = await import("@/lib/errors");
    if (isAuthError(err)) throw err;
    console.error("[settings] getCtx failed", err);
    const { getDb, LOCAL_WORKSPACE_ID } = await import("@/lib/db");
    ctx = {
      db: getDb(undefined, LOCAL_WORKSPACE_ID),
      workspaceId: LOCAL_WORKSPACE_ID,
      metered: false,
      userId: "local",
      userEmail: "local@demo.hermes",
      userName: "Local",
      scopeToWorkspace: (wsId) => getDb(undefined, wsId),
    };
    usage = await getWorkspaceSummary(ctx);
    ws = await ctx.db.getWorkspace(ctx.workspaceId);
  }
  const plan = getPlan(usage.planId);
  const { mailboxPublicStatus } = await import("@/lib/email/mailbox");
  const mailbox = mailboxPublicStatus(ws);
  const session = await auth().catch(() => null);
  // Local demo: tools stay available. Production: users.is_admin via JWT.
  const showAdminTools = isAdminSession(session);
  const isAdmin = showAdminTools;
  const userEmail =
    (session?.user?.email as string | undefined) ?? ctx.userEmail ?? null;

  const canSendEmail =
    caps.canSendEmail ||
    !!ws?.resendApiKey?.trim() ||
    !!ws?.mailerooApiKey?.trim() ||
    !!ws?.connectedMailbox;

  // Prefer Easy when Maileroo is the Easy provider or user last chose Easy.
  const defaultPath: "easy" | "pro" =
    mailboxFlag === "connected"
      ? "pro"
      : ws?.preferredSendPath === "easy" ||
          ws?.preferredSendPath === "pro"
        ? ws.preferredSendPath
        : ws?.easyEmailProvider === "maileroo"
          ? "easy"
          : mailbox.connected
            ? "pro"
            : "easy";

  const appUrl = env.appUrl();
  const appUrlLooksLocal =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(appUrl);

  if (isAdmin) {
    return (
      <main className="mx-auto min-h-dvh max-w-7xl px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-5 sm:pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Admin settings
        </h1>
        <p className="mt-0.5 text-sm text-mist-500">
          Platform tools for operators — not a personal lead studio.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
            Signed in as
          </h2>
          <div className="rounded-xl2 border border-white/10 p-5">
            <p className="font-medium text-mist-100">{userEmail ?? "Admin"}</p>
            <p className="mt-1 text-sm text-mist-500">
              Manage tenants from Dashboard and Users. Plan overrides and credit
              resets for this admin workspace live below.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link
                href="/app?view=admin"
                className="text-aurora-300 hover:underline"
              >
                ← Platform dashboard
              </Link>
              <Link
                href="/app?view=admin-users"
                className="text-aurora-300 hover:underline"
              >
                Users
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
            Admin tools
          </h2>
          <DeveloperModePanel metered={usage.metered} currentPlanId={usage.planId} />
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
                <p className="text-sm text-mist-500">Product walkthrough for support context.</p>
              </div>
              <span className="text-mist-500">→</span>
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-7xl px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-5 sm:pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
      <p className="mt-0.5 text-sm text-mist-500">
        Profiles, sending setup, and workspace preferences.
      </p>

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
          Outreach profiles
        </h2>
        <SenderProfileForm />
      </section>

      <section className="mt-8" data-tour="sending-setup" id="sending-setup">
        <SendSetupPanel
          canSendEmail={canSendEmail}
          canEdit={true}
          mailbox={mailbox}
          defaultPath={defaultPath}
          appUrlLooksLocal={caps.gmailOAuth && appUrlLooksLocal}
          canVerifyEmail={caps.emailVerify}
          emailVerifyEnabled={ws?.emailVerifyEnabled !== false}
          initial={{
            fromName: ws?.fromName ?? null,
            fromEmail: ws?.fromEmail ?? null,
            replyTo: ws?.replyTo ?? null,
            physicalAddress: ws?.physicalAddress ?? null,
            easyEmailProvider: ws?.easyEmailProvider ?? "resend",
            preferredSendPath: ws?.preferredSendPath ?? null,
            hasResendKey: !!ws?.resendApiKey?.trim(),
            hasMailerooKey: !!ws?.mailerooApiKey?.trim(),
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
          Plan &amp; usage
        </h2>
        <div className="rounded-xl2 border border-white/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-xl font-semibold">{plan.name} plan</p>
              <p className="text-sm text-mist-500">
                {usage.planId === "insider"
                  ? "Shared lead pool powers live search for all Insiders. Sends are unlimited (your own mailbox)."
                  : usage.metered
                    ? "Usage resets on the 1st of each month."
                    : "You’re on the local preview — open the live app to save sending details and use your plan."}
              </p>
            </div>
            {usage.metered && <BillingActions paid={isPaidPlan(usage.planId)} />}
          </div>
          {usage && (
            <div className="mt-5">
              <div
                className={`grid gap-4 ${
                  caps.emailVerify && usage.emailVerifyEnabled
                    ? "sm:grid-cols-3"
                    : "sm:grid-cols-2"
                }`}
              >
                {usage.planId === "insider" ? (
                  <UsageBar
                    label="Leads"
                    title="Firecrawl credits"
                    unavailable={usage.firecrawlCreditsRemaining == null}
                    remaining={usage.firecrawlCreditsRemaining ?? undefined}
                  />
                ) : (
                  <UsageBar
                    label="Leads"
                    used={usage.leadsUsed}
                    limit={usage.leadsLimit}
                  />
                )}
                <UsageBar
                  label="Sends"
                  used={usage.unlimitedSends ? 0 : usage.sendsUsed}
                  limit={usage.unlimitedSends ? 0 : usage.sendsLimit}
                />
                {caps.emailVerify && usage.emailVerifyEnabled ? (
                  <UsageBar
                    label="Verifies / day"
                    used={usage.verifiesUsed}
                    limit={usage.verifiesLimit}
                  />
                ) : null}
              </div>
              {caps.emailVerify && usage.emailVerifyEnabled ? (
                <p className="mt-2 text-xs text-mist-500">
                  Email checks reset daily (midnight UTC)
                  {usage.verifiesResetsAt
                    ? ` · next reset ${new Date(usage.verifiesResetsAt).toLocaleString()}`
                    : ""}
                  .
                </p>
              ) : null}
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
          <Link
            href="/deliverability"
            className="flex items-center gap-4 border-t border-white/5 p-5 transition-colors hover:bg-white/[0.03]"
          >
            <HelpIcon className="h-5 w-5 shrink-0 text-mist-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Deliverability guide</p>
              <p className="text-sm text-mist-500">DNS, warmup, and keeping mail out of spam.</p>
            </div>
            <span className="text-mist-500">→</span>
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Danger zone
        </h2>
        <DeleteAccountPanel email={userEmail} liveApp={authRequired()} />
      </section>
    </main>
  );
}

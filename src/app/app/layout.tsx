import { Suspense } from "react";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { authRequired, env, getCapabilities } from "@/lib/config";
import { StudioShell } from "@/components/studio/StudioShell";

/**
 * Studio chrome must never depend on D1/workspace resolution. Auth() is safe
 * here for admin nav gating; Settings still loads workspace values itself.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const caps = getCapabilities();
  const session = await auth().catch(() => null);
  // Local demo: show admin nav so you can dogfood without ADMIN_EMAIL session.
  const isAdmin = !authRequired() || isAdminEmail(session?.user?.email);

  const identity = {
    fromName: env.fromName(),
    fromEmail: env.fromEmail(),
    physicalAddress: env.physicalAddress(),
  };

  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-mist-500">Loading…</div>
      }
    >
      <StudioShell
        authRequired={authRequired()}
        credentialsMode={!authRequired()}
        magicLink={caps.smtp || caps.resend}
        turnstileSiteKey={env.turnstileSiteKey() || null}
        isAdmin={isAdmin}
        caps={{
          canSearchLive: caps.canSearchLive,
          canSendEmail: caps.canSendEmail,
          firecrawl: caps.firecrawl,
          resend: caps.resend,
          smtp: caps.smtp,
        }}
        identity={identity}
      >
        {children}
      </StudioShell>
    </Suspense>
  );
}

import { Suspense } from "react";
import { authRequired, env, getCapabilities } from "@/lib/config";
import { StudioShell } from "@/components/studio/StudioShell";

/**
 * Studio chrome must never depend on D1/session. A failed getCtx/getWorkspace
 * here used to 500 the entire /app tree after magic-link sign-in. Identity for
 * the Getting Started wizard uses env defaults; Settings loads real workspace
 * values on that page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const caps = getCapabilities();

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

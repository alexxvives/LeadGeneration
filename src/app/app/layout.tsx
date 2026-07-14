import { Suspense } from "react";
import { authRequired, env, getCapabilities } from "@/lib/config";
import { StudioShell } from "@/components/studio/StudioShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const caps = getCapabilities();
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
      >
        {children}
      </StudioShell>
    </Suspense>
  );
}

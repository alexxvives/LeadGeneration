import type { ReactNode } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { MarketingSignInProvider } from "@/components/MarketingSignIn";
import { authRequired, env, getCapabilities } from "@/lib/config";

/**
 * Shared marketing page chrome: aurora atmosphere, nav, content, footer.
 * Sign-in opens as an overlay (not a separate page) via MarketingSignInProvider.
 */
export function MarketingShell({
  children,
  footerTagline,
  glow = "md",
}: {
  children: ReactNode;
  footerTagline?: string;
  /** Hero pages use stronger aurora; inner pages stay quieter. */
  glow?: "sm" | "md" | "lg";
}) {
  const glowOpacity =
    glow === "lg" ? "opacity-70" : glow === "sm" ? "opacity-30" : "opacity-45";
  const caps = getCapabilities();
  const required = authRequired();

  return (
    <MarketingSignInProvider
      authRequired={required}
      magicLink={caps.smtp || caps.resend}
      turnstileSiteKey={caps.turnstile ? env.turnstileSiteKey() : null}
    >
      <main className="relative min-h-screen overflow-hidden">
        <div
          className={`pointer-events-none absolute inset-0 -z-10 aurora-glow ${glowOpacity}`}
        />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_transparent_0%,_#060a12_72%)]" />
        <div className="pointer-events-none absolute inset-0 -z-10 hero-grid opacity-60" />

        <SiteNav authRequired={required} />
        {children}
        <SiteFooter tagline={footerTagline} />
      </main>
    </MarketingSignInProvider>
  );
}

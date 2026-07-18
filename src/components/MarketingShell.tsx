import type { ReactNode } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { authRequired } from "@/lib/config";

/**
 * Shared marketing page chrome: aurora atmosphere, nav, content, footer.
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

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className={`pointer-events-none absolute inset-0 -z-10 aurora-glow ${glowOpacity}`}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_transparent_0%,_#060a12_72%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 hero-grid opacity-60" />

      <SiteNav authRequired={authRequired()} />
      {children}
      <SiteFooter tagline={footerTagline} />
    </main>
  );
}

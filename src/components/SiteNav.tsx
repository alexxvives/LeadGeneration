"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { AuthModal } from "@/components/AuthModal";
import { useState } from "react";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/ethics", label: "Ethics" },
  { href: "/deliverability", label: "Deliverability" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * Shared marketing header — Sign in opens auth (no guest); Open studio goes
 * straight to /app (studio may still offer Continue as guest there).
 */
export function SiteNav({
  authRequired = false,
  credentialsMode = true,
  magicLink = false,
  turnstileSiteKey = null,
}: {
  authRequired?: boolean;
  credentialsMode?: boolean;
  magicLink?: boolean;
  turnstileSiteKey?: string | null;
}) {
  const pathname = usePathname();
  const [authOpen, setAuthOpen] = useState(false);

  const linkClass = (href: string) =>
    `transition-colors hover:text-mist-100 ${
      pathname === href ? "text-mist-100" : "text-mist-300"
    }`;

  return (
    <>
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <BrandMark />
        </Link>
        <nav className="flex items-center gap-4 text-sm sm:gap-6">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`hidden sm:inline ${linkClass(l.href)}`}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/pricing" className={`sm:hidden ${linkClass("/pricing")}`}>
            Pricing
          </Link>
          <button type="button" onClick={() => setAuthOpen(true)} className={linkClass("")}>
            Sign in
          </button>
          <Link
            href="/app"
            className="rounded-full bg-aurora-400 px-4 py-2 font-medium text-ink-950 transition-transform hover:scale-105"
          >
            Open studio
          </Link>
        </nav>
      </header>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        authRequired={authRequired}
        credentialsMode={credentialsMode}
        magicLink={magicLink}
        turnstileSiteKey={turnstileSiteKey}
        callbackUrl="/app"
        allowGuest={false}
      />
    </>
  );
}

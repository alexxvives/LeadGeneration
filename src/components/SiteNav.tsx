"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { XIcon } from "@/components/icons";
import { useMarketingSignIn } from "@/components/MarketingSignIn";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/ethics", label: "Ethics" },
  { href: "/deliverability", label: "Deliverability" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * Shared marketing header — one primary CTA:
 *  - production (auth required): Sign in → overlay modal
 *  - local demo: Open studio → /app
 */
export function SiteNav({ authRequired = false }: { authRequired?: boolean }) {
  const pathname = usePathname();
  const onLogin = pathname === "/login";
  const [open, setOpen] = useState(false);
  const { openSignIn } = useMarketingSignIn();

  const linkClass = (href: string) =>
    `transition-colors hover:text-mist-100 ${
      pathname === href ? "text-mist-100" : "text-mist-300"
    }`;

  const ctaClass =
    "rounded-full bg-aurora-400 px-4 py-2 font-medium text-on-accent transition-transform hover:scale-105";
  const ctaClassMobile =
    "rounded-full bg-aurora-400 px-3.5 py-1.5 text-sm font-medium text-on-accent";

  function renderCta(mobile: boolean) {
    const cls = mobile ? ctaClassMobile : ctaClass;
    if (!authRequired) {
      return (
        <Link href="/app" className={cls}>
          Open studio
        </Link>
      );
    }
    return (
      <button type="button" onClick={openSignIn} className={cls}>
        Sign in
      </button>
    );
  }

  return (
    <header className="relative z-20 mx-auto w-full max-w-7xl px-5 py-5 sm:px-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <BrandMark />
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
          {!onLogin ? renderCta(false) : null}
        </nav>

        <div className="flex items-center gap-3 md:hidden">
          {!onLogin ? renderCta(true) : null}
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-mist-100 transition-colors hover:border-white/20"
          >
            {open ? (
              <XIcon className="h-4 w-4" />
            ) : (
              <span className="flex flex-col gap-1" aria-hidden>
                <span className="block h-0.5 w-4 rounded-full bg-mist-100" />
                <span className="block h-0.5 w-4 rounded-full bg-mist-100" />
                <span className="block h-0.5 w-3 rounded-full bg-mist-100" />
              </span>
            )}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="mt-4 flex flex-col gap-1 border-t border-white/5 pt-4 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2.5 text-sm ${linkClass(l.href)} ${
                pathname === l.href ? "bg-white/5" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/ethics", label: "Ethics" },
  { href: "/deliverability", label: "Deliverability" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * Shared marketing header — one primary CTA:
 *  - production (auth required): Sign in → /login
 *  - local demo: Open studio → /app
 */
export function SiteNav({ authRequired = false }: { authRequired?: boolean }) {
  const pathname = usePathname();
  const onLogin = pathname === "/login";

  const linkClass = (href: string) =>
    `transition-colors hover:text-mist-100 ${
      pathname === href ? "text-mist-100" : "text-mist-300"
    }`;

  return (
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
        {!onLogin ? (
          <Link
            href={authRequired ? "/login" : "/app"}
            className="rounded-full bg-aurora-400 px-4 py-2 font-medium text-ink-950 transition-transform hover:scale-105"
          >
            {authRequired ? "Sign in" : "Open studio"}
          </Link>
        ) : null}
      </nav>
    </header>
  );
}

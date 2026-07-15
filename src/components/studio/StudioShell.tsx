"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { signOut, useSession } from "next-auth/react";
import { BrandMark } from "@/components/BrandMark";
import { AuthModal } from "@/components/AuthModal";
import {
  SearchIcon,
  SettingsIcon,
  GlobeIcon,
  PipelineIcon,
  HistoryIcon,
  LogoutIcon,
  MailIcon,
} from "@/components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Studio chrome: left sidebar with product navigation + account footer.
 * Settings opens from the account card (not a Workspace nav item).
 */
export function StudioShell({
  children,
  authRequired,
  credentialsMode,
  magicLink,
  turnstileSiteKey,
}: {
  children: React.ReactNode;
  authRequired: boolean;
  credentialsMode: boolean;
  magicLink: boolean;
  turnstileSiteKey: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);

  const view = searchParams.get("view");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = sessionStorage.getItem("lodestar_guest") === "1";
    if (!ok && !authRequired && status !== "authenticated") {
      setAuthOpen(true);
    }
  }, [authRequired, status]);

  const markGuest = () => {
    sessionStorage.setItem("lodestar_guest", "1");
    setAuthOpen(false);
  };

  const signedIn = status === "authenticated" && !!session?.user;
  const displayName = (session?.user?.name as string | undefined) ?? null;
  const userEmail = (session?.user?.email as string | undefined) ?? null;
  const settingsActive = pathname.startsWith("/app/settings");

  const nav: {
    href: string;
    label: string;
    icon: Icon;
    active: boolean;
  }[] = [
    {
      href: "/app",
      label: "Search",
      icon: SearchIcon,
      active: pathname === "/app" && !view,
    },
    {
      href: "/app?view=pipeline",
      label: "Pipeline",
      icon: PipelineIcon,
      active: pathname === "/app" && view === "pipeline",
    },
    {
      href: "/app?view=runs",
      label: "Runs",
      icon: HistoryIcon,
      active: pathname === "/app" && view === "runs",
    },
  ];

  return (
    <div className="relative flex min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 aurora-glow opacity-40" />

      <aside className="sticky top-0 z-30 flex h-screen w-16 flex-col border-r border-white/5 bg-ink-950/90 py-5 backdrop-blur-xl sm:w-64 sm:px-4">
        <Link
          href="/"
          className="mb-8 flex justify-center px-1 transition-opacity hover:opacity-80 sm:justify-start"
        >
          <span className="hidden sm:inline">
            <BrandMark />
          </span>
          <span className="sm:hidden">
            <GlobeIcon className="h-6 w-6 text-aurora-300" />
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          <p className="mb-1 hidden px-3 text-[10px] uppercase tracking-wider text-mist-500 sm:block">
            Workspace
          </p>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors sm:justify-start ${
                  item.active
                    ? "bg-aurora-400/10 text-aurora-300"
                    : "text-mist-300 hover:bg-white/5 hover:text-mist-100"
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 transition-transform duration-300 ease-out group-hover:scale-125 group-hover:-translate-y-0.5 group-hover:rotate-[-6deg] ${
                    item.active ? "text-aurora-300" : "text-mist-500 group-hover:text-aurora-300"
                  }`}
                />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Account card → Settings */}
        <div className="mt-auto border-t border-white/5 pt-4">
          {/* Full sidebar (sm+) */}
          <div className="hidden sm:block">
            <Link
              href="/app/settings"
              className={`block rounded-xl border p-3 transition-colors ${
                settingsActive
                  ? "border-aurora-400/30 bg-aurora-400/10"
                  : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
              }`}
              title="Open settings"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aurora-400/15 text-sm font-semibold text-aurora-300">
                  {signedIn ? (displayName?.[0] ?? userEmail?.[0] ?? "U").toUpperCase() : "G"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-mist-100">
                    {signedIn ? (displayName ?? userEmail ?? "Account") : "Guest"}
                  </p>
                  <p className="truncate text-xs text-mist-500">
                    {signedIn && userEmail && displayName
                      ? userEmail
                      : "Settings"}
                  </p>
                </div>
                {signedIn ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void signOut({ callbackUrl: "/" });
                    }}
                    title="Sign out"
                    className="rounded-lg p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-200"
                  >
                    <LogoutIcon className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAuthOpen(true);
                    }}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-aurora-300 transition-colors hover:bg-aurora-400/10"
                  >
                    Sign in
                  </button>
                )}
              </div>
            </Link>
          </div>

          {/* Icon-only (mobile): settings + auth */}
          <div className="flex flex-col items-center gap-1 sm:hidden">
            <Link
              href="/app/settings"
              title="Settings"
              className={`rounded-xl p-2.5 transition-colors ${
                settingsActive
                  ? "bg-aurora-400/10 text-aurora-300"
                  : "text-mist-500 hover:bg-white/5 hover:text-aurora-300"
              }`}
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>
            {signedIn ? (
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                title="Sign out"
                className="rounded-xl p-2.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-200"
              >
                <LogoutIcon className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                title="Sign in"
                className="rounded-xl p-2.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-aurora-300"
              >
                <MailIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>

      <AuthModal
        open={authOpen}
        onClose={() => {
          if (!authRequired) markGuest();
        }}
        authRequired={authRequired}
        credentialsMode={credentialsMode}
        magicLink={magicLink}
        turnstileSiteKey={turnstileSiteKey}
        callbackUrl="/app"
        allowGuest={!authRequired}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ComponentType, type SVGProps } from "react";
import { signOut, useSession } from "next-auth/react";
import { BrandMark } from "@/components/BrandMark";
import { AuthModal } from "@/components/AuthModal";
import {
  GettingStartedWizard,
  useGettingStartedOpen,
  isGettingStartedDone,
  type GettingStartedCaps,
  type GettingStartedIdentity,
} from "@/components/studio/GettingStartedWizard";
import {
  BoardPicker,
  loadStoredBoardFilter,
  storeBoardFilter,
} from "@/components/studio/BoardPicker";
import { api } from "@/lib/client-api";
import type { BoardSummary } from "@/lib/types";
import {
  SearchIcon,
  SettingsIcon,
  PipelineIcon,
  HistoryIcon,
  LogoutIcon,
  MailIcon,
  UsersIcon,
  DashboardIcon,
  BoardsIcon,
} from "@/components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const GUEST_KEY = "leadify_guest";
const GUEST_LEGACY = "lodestar_guest";

function isGuestSession(): boolean {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(GUEST_KEY) === "1") return true;
  if (sessionStorage.getItem(GUEST_LEGACY) === "1") {
    sessionStorage.setItem(GUEST_KEY, "1");
    sessionStorage.removeItem(GUEST_LEGACY);
    return true;
  }
  return false;
}

function markGuestSession(): void {
  sessionStorage.setItem(GUEST_KEY, "1");
  sessionStorage.removeItem(GUEST_LEGACY);
}

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
  caps,
  identity,
}: {
  children: React.ReactNode;
  authRequired: boolean;
  credentialsMode: boolean;
  magicLink: boolean;
  turnstileSiteKey: string | null;
  caps: GettingStartedCaps;
  identity: GettingStartedIdentity;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const { open: setupOpen, setOpen: setSetupOpen } = useGettingStartedOpen();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);

  const view = searchParams.get("view");
  const boardParam = searchParams.get("board");

  const refreshBoards = useCallback(() => {
    api
      .listBoards()
      .then(({ boards: list }) => setBoards(list))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshBoards();
  }, [refreshBoards, pathname, view]);

  // Sync board filter from URL, else localStorage. Keep `board` in the URL so
  // every view (leads/pipeline/…) filters the same way.
  useEffect(() => {
    if (boardParam === "all" || boardParam === "") {
      setActiveBoardId(null);
      storeBoardFilter("all");
      return;
    }
    if (boardParam) {
      setActiveBoardId(boardParam);
      storeBoardFilter(boardParam);
      return;
    }
    const stored = loadStoredBoardFilter();
    const id = stored === "all" || !stored ? null : stored;
    setActiveBoardId(id);
    if (id && pathname.startsWith("/app")) {
      const params = new URLSearchParams(searchParams.toString());
      if (!params.has("board")) {
        params.set("board", id);
        const q = params.toString();
        router.replace(q ? `${pathname}?${q}` : pathname);
      }
    }
  }, [boardParam, pathname, router, searchParams]);

  const setBoardFilter = (id: string | null) => {
    const next = id ?? "all";
    storeBoardFilter(next);
    setActiveBoardId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("board");
    else params.set("board", next);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  };

  const boardHref = (href: string) => {
    if (!activeBoardId) return href;
    const join = href.includes("?") ? "&" : "?";
    return `${href}${join}board=${encodeURIComponent(activeBoardId)}`;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = isGuestSession();
    if (!ok && !authRequired && status !== "authenticated") {
      setAuthOpen(true);
    }
  }, [authRequired, status]);

  useEffect(() => {
    if (authOpen && setupOpen && searchParams.get("setup") !== "1") {
      setSetupOpen(false);
    }
  }, [authOpen, setupOpen, setSetupOpen, searchParams]);

  useEffect(() => {
    if (authOpen || typeof window === "undefined") return;
    if (searchParams.get("setup") === "1") return;
    try {
      if (!isGettingStartedDone()) {
        const guest = isGuestSession();
        if (guest || status === "authenticated" || authRequired) {
          setSetupOpen(true);
        }
      }
    } catch {
      /* ignore */
    }
  }, [authOpen, status, authRequired, setSetupOpen, searchParams]);

  const markGuest = () => {
    markGuestSession();
    setAuthOpen(false);
  };

  const signedIn = status === "authenticated" && !!session?.user;
  const displayName = (session?.user?.name as string | undefined) ?? null;
  const userEmail = (session?.user?.email as string | undefined) ?? null;
  const settingsActive = pathname.startsWith("/app/settings");

  const navSections: {
    label: string;
    items: {
      href: string;
      label: string;
      icon: Icon;
      active: boolean;
    }[];
  }[] = [
    {
      label: "Overview",
      items: [
        {
          href: "/app?view=dashboard",
          label: "Dashboard",
          icon: DashboardIcon,
          active: pathname === "/app" && view === "dashboard",
        },
      ],
    },
    {
      label: "Find",
      items: [
        {
          href: "/app",
          label: "Search",
          icon: SearchIcon,
          active: pathname === "/app" && !view,
        },
        {
          href: "/app?view=leads",
          label: "Leads",
          icon: UsersIcon,
          active: pathname === "/app" && view === "leads",
        },
      ],
    },
    {
      label: "Engage",
      items: [
        {
          href: "/app?view=pipeline",
          label: "Pipeline",
          icon: PipelineIcon,
          active: pathname === "/app" && view === "pipeline",
        },
        {
          href: "/app?view=outreach",
          label: "Outreach",
          icon: MailIcon,
          active: pathname === "/app" && view === "outreach",
        },
      ],
    },
    {
      label: "Organize",
      items: [
        {
          href: "/app?view=boards",
          label: "Boards",
          icon: BoardsIcon,
          active: pathname === "/app" && view === "boards",
        },
        {
          href: "/app?view=runs",
          label: "Runs",
          icon: HistoryIcon,
          active: pathname === "/app" && view === "runs",
        },
      ],
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
            <BrandMark size="sm" withWordmark={false} />
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="flex flex-col gap-1">
              <p className="mb-0.5 hidden px-3 text-[10px] uppercase tracking-wider text-mist-500 sm:block">
                {section.label}
              </p>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={boardHref(item.href)}
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
            </div>
          ))}
        </nav>

        {/* Board filter + account card */}
        <div className="mt-auto border-t border-white/5 pt-4">
          <BoardPicker
            boards={boards}
            activeBoardId={activeBoardId}
            onChange={setBoardFilter}
          />

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

      <GettingStartedWizard
        open={setupOpen && !authOpen}
        onClose={() => setSetupOpen(false)}
        caps={caps}
        identity={identity}
      />
    </div>
  );
}

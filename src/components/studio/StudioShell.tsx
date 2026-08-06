"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
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
import {
  loadOutreachProfiles,
  setActiveOutreachProfile,
} from "@/lib/sender-profile";
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
  ShieldIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons";

const SIDEBAR_COLLAPSED_KEY = "hermes_sidebar_collapsed";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const GUEST_KEY = "hermes_guest";
const GUEST_LEGACY = ["leadify_guest", "lodestar_guest"];

function isGuestSession(): boolean {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(GUEST_KEY) === "1") return true;
  for (const legacy of GUEST_LEGACY) {
    if (sessionStorage.getItem(legacy) === "1") {
      sessionStorage.setItem(GUEST_KEY, "1");
      sessionStorage.removeItem(legacy);
      return true;
    }
  }
  return false;
}

function markGuestSession(): void {
  sessionStorage.setItem(GUEST_KEY, "1");
  for (const legacy of GUEST_LEGACY) sessionStorage.removeItem(legacy);
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
  isAdmin = false,
}: {
  children: React.ReactNode;
  authRequired: boolean;
  credentialsMode: boolean;
  magicLink: boolean;
  turnstileSiteKey: string | null;
  caps: GettingStartedCaps;
  identity: GettingStartedIdentity;
  /** Platform admin — shows Admin nav (overview + users). */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const { open: setupOpen, setOpen: setSetupOpen } = useGettingStartedOpen();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const inviteRedirectTried = useRef(false);
  /** Optimistic sidebar highlight — set on click, cleared when URL catches up. */
  const [pendingNavView, setPendingNavView] = useState<string | null>(null);

  const view = searchParams.get("view");
  const urlView = view ?? "";
  const displayView = pendingNavView ?? urlView;
  const boardParam = searchParams.get("board");
  const userId =
    session?.userId ??
    session?.user?.id ??
    (session?.user?.email ? `user_${session.user.email}` : null);

  useEffect(() => {
    if (pendingNavView !== null && pendingNavView === urlView) {
      setPendingNavView(null);
    }
  }, [urlView, pendingNavView]);

  const refreshBoards = useCallback(() => {
    api
      .listBoards()
      .then(({ boards: list }) => setBoards(list))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshBoards();
  }, [refreshBoards, pathname, view]);

  // Sync board from URL, else localStorage, else first board. Always a single
  // board (no "All"). Drop stale ids. Skip URL inject while the tour is open.
  useEffect(() => {
    const fallback = boards[0]?.id ?? null;
    const resolve = (candidate: string | null): string | null => {
      if (!candidate || candidate === "all") return fallback;
      if (boards.length === 0) return candidate;
      return boards.some((b) => b.id === candidate) ? candidate : fallback;
    };

    if (boardParam === "all" || boardParam === "") {
      const id = fallback;
      setActiveBoardId(id);
      if (id) {
        storeBoardFilter(id);
        if (!setupOpen && pathname.startsWith("/app")) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("board", id);
          const q = params.toString();
          router.replace(q ? `${pathname}?${q}` : pathname);
        }
      } else {
        storeBoardFilter("all");
      }
      return;
    }
    if (boardParam) {
      const id = resolve(boardParam);
      setActiveBoardId(id);
      if (id) storeBoardFilter(id);
      if (id && id !== boardParam && !setupOpen && pathname.startsWith("/app")) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("board", id);
        const q = params.toString();
        router.replace(q ? `${pathname}?${q}` : pathname);
      }
      return;
    }
    const stored = loadStoredBoardFilter();
    const id = resolve(stored || null);
    setActiveBoardId(id);
    if (!id) return;
    storeBoardFilter(id);
    if (setupOpen) return;
    if (pathname.startsWith("/app")) {
      const params = new URLSearchParams(searchParams.toString());
      if (!params.has("board")) {
        params.set("board", id);
        const q = params.toString();
        router.replace(q ? `${pathname}?${q}` : pathname);
      }
    }
  }, [boardParam, boards, pathname, router, searchParams, setupOpen]);

  const setBoardFilter = (id: string) => {
    storeBoardFilter(id);
    setActiveBoardId(id);
    const linked = boards.find((b) => b.id === id)?.outreachProfileId;
    if (linked) setActiveOutreachProfile(linked);
    const params = new URLSearchParams(searchParams.toString());
    params.set("board", id);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  };

  // Keep profile aligned when URL/storage restores a board (not only picker clicks).
  useEffect(() => {
    if (!activeBoardId) return;
    const linked = boards.find((b) => b.id === activeBoardId)?.outreachProfileId;
    if (!linked) return;
    if (loadOutreachProfiles().activeId === linked) return;
    setActiveOutreachProfile(linked);
  }, [activeBoardId, boards]);

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
      if (!isGettingStartedDone(userId)) {
        const guest = isGuestSession();
        if (guest || status === "authenticated" || authRequired) {
          setSetupOpen(true);
        }
      }
    } catch {
      /* ignore */
    }
  }, [authOpen, status, authRequired, setSetupOpen, searchParams, userId]);

  // Reset invite redirect when the signed-in account changes.
  useEffect(() => {
    inviteRedirectTried.current = false;
  }, [userId]);

  // After login (and after the tour closes), surface pending board invites.
  useEffect(() => {
    if (status !== "authenticated" || authOpen || setupOpen) return;
    if (typeof window === "undefined") return;
    // Wait until the tour is finished (or was already done) so invites show after it.
    if (!isGettingStartedDone(userId)) return;
    if (inviteRedirectTried.current) return;
    if (searchParams.get("view") === "boards") {
      inviteRedirectTried.current = true;
      return;
    }
    inviteRedirectTried.current = true;
    let cancelled = false;
    api
      .listMyInvites()
      .then(({ invites }) => {
        if (cancelled || invites.length === 0) return;
        router.replace("/app?view=boards");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, authOpen, setupOpen, userId, searchParams, router]);

  const markGuest = () => {
    markGuestSession();
    setAuthOpen(false);
  };

  const signedIn = status === "authenticated" && !!session?.user;
  const displayName = (session?.user?.name as string | undefined) ?? null;
  const userEmail = (session?.user?.email as string | undefined) ?? null;
  const settingsActive = pathname.startsWith("/app/settings");
  const onApp = pathname === "/app";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Studio nav for everyone; admins also get platform Admin section.
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
          active: onApp && displayView === "dashboard",
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
          active: onApp && displayView === "",
        },
        {
          href: "/app?view=leads",
          label: "Leads",
          icon: UsersIcon,
          active: onApp && displayView === "leads",
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
          active: onApp && displayView === "pipeline",
        },
        {
          href: "/app?view=outreach",
          label: "Outreach",
          icon: MailIcon,
          active: onApp && displayView === "outreach",
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
          active: onApp && displayView === "boards",
        },
        {
          href: "/app?view=runs",
          label: "Runs",
          icon: HistoryIcon,
          active: onApp && displayView === "runs",
        },
      ],
    },
    ...(isAdmin
      ? [
          {
            label: "Admin",
            items: [
              {
                href: "/app?view=admin",
                label: "Platform",
                icon: ShieldIcon,
                active: onApp && displayView === "admin",
              },
              {
                href: "/app?view=admin-users",
                label: "Users",
                icon: UsersIcon,
                active: onApp && displayView === "admin-users",
              },
            ],
          },
        ]
      : []),
  ];

  const wide = !sidebarCollapsed;

  return (
    <div className="relative flex min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 aurora-glow opacity-40" />

      <aside
        className={`sticky top-0 z-30 flex h-screen flex-col border-r border-white/5 bg-ink-950/90 py-5 backdrop-blur-xl transition-[width] duration-200 ease-out ${
          wide ? "relative w-16 sm:w-[18.4rem] sm:px-4" : "relative w-16"
        }`}
      >
        {wide ? (
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="absolute right-2 top-3 z-10 hidden rounded-lg p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100 sm:inline-flex"
            aria-label="Collapse sidebar"
            title="Collapse menu"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="mb-3 hidden items-center justify-center self-center rounded-lg p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100 sm:inline-flex"
            aria-label="Expand sidebar"
            title="Expand menu"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}

        <Link
          href="/"
          className={`mb-8 flex px-1 transition-opacity hover:opacity-80 ${
            wide ? "justify-center sm:justify-start sm:pr-8" : "justify-center"
          }`}
        >
          <span className={wide ? "hidden sm:inline" : "hidden"}>
            <BrandMark />
          </span>
          <span className={wide ? "sm:hidden" : ""}>
            <BrandMark size="sm" withWordmark={false} />
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="flex flex-col gap-1">
              <p
                className={`mb-0.5 px-3 text-[10px] uppercase tracking-wider text-mist-500 ${
                  wide ? "hidden sm:block" : "hidden"
                }`}
              >
                {section.label}
              </p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const viewKey = (() => {
                  const q = item.href.indexOf("?");
                  if (q < 0) return "";
                  return new URLSearchParams(item.href.slice(q + 1)).get("view") ?? "";
                })();
                return (
                  <Link
                    key={item.href}
                    href={boardHref(item.href)}
                    onClick={() => setPendingNavView(viewKey)}
                    title={item.label}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      wide ? "justify-center sm:justify-start" : "justify-center"
                    } ${
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
                    <span className={wide ? "hidden sm:inline" : "hidden"}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Board + outreach profile filters + account card */}
        <div className="mt-auto border-t border-white/5 pt-5">
          {wide &&
          displayView !== "admin" &&
          displayView !== "admin-users" ? (
            <div className="mb-5">
              <BoardPicker
                boards={boards}
                activeBoardId={activeBoardId}
                onChange={setBoardFilter}
              />
            </div>
          ) : null}

          <div className={wide ? "hidden sm:block" : "hidden"}>
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

          <div
            className={`flex flex-col items-center gap-1 ${
              wide ? "sm:hidden" : ""
            }`}
          >
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
        userId={userId}
      />
    </div>
  );
}

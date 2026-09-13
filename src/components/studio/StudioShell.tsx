"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ComponentType,
  type MouseEvent,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { XIcon } from "@/components/icons";
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
  MobileBoardButton,
  loadStoredBoardFilter,
  storeBoardFilter,
} from "@/components/studio/BoardPicker";
import { api } from "@/lib/client-api";
import {
  loadOutreachProfiles,
  setActiveOutreachProfile,
} from "@/lib/sender-profile";
import type { BoardSummary } from "@/lib/types";
import { LayoutGridIcon } from "@/components/lucide-animated/layout-grid";
import { SearchIcon } from "@/components/lucide-animated/search";
import { UsersIcon } from "@/components/lucide-animated/users";
import { FolderKanbanIcon } from "@/components/lucide-animated/folder-kanban";
import { MailboxIcon } from "@/components/lucide-animated/mailbox";
import { CalendarDaysIcon } from "@/components/lucide-animated/calendar-days";
import { MessagesSquareIcon } from "@/components/lucide-animated/messages-square";
import { ContactIcon } from "@/components/lucide-animated/contact";
import { LayersIcon } from "@/components/lucide-animated/layers";
import { HistoryIcon } from "@/components/lucide-animated/history";
import { ShieldCheckIcon } from "@/components/lucide-animated/shield-check";
import { SettingsIcon } from "@/components/lucide-animated/settings";
import { LogoutIcon } from "@/components/lucide-animated/logout";
import { ChevronLeftIcon } from "@/components/lucide-animated/chevron-left";
import { ChevronRightIcon } from "@/components/lucide-animated/chevron-right";
import {
  useIconMotion,
  type IconMotionHandle,
} from "@/components/lucide-animated/hover";
import { useQuotaHint } from "./quota-hint";

const SIDEBAR_COLLAPSED_KEY = "hermes_sidebar_collapsed";

type AnimatedIcon = ComponentType<{
  size?: number;
  className?: string;
  ref?: Ref<IconMotionHandle>;
}>;

function studioViewTitle(settingsActive: boolean, displayView: string): string {
  if (settingsActive) return "Settings";
  switch (displayView) {
    case "dashboard":
      return "Dashboard";
    case "leads":
      return "Leads";
    case "pipeline":
      return "Pipeline";
    case "conversations":
      return "Conversations";
    case "outreach":
      return "Outreach";
    case "calendar":
      return "Calendar";
    case "contacts":
      return "Collaborators";
    case "boards":
      return "Boards";
    case "runs":
      return "Runs";
    case "admin":
      return "Platform";
    case "admin-users":
      return "Users";
    default:
      return "Search";
  }
}

function StudioNavLink({
  href,
  label,
  icon: Icon,
  active,
  wide,
  onNavigate,
  variant = "rail",
  badge = false,
  badgeLabel,
}: {
  href: string;
  label: string;
  icon: AnimatedIcon;
  active: boolean;
  wide: boolean;
  onNavigate: () => void;
  variant?: "rail" | "sheet";
  badge?: boolean;
  badgeLabel?: string;
}) {
  const { ref, bind } = useIconMotion();
  const sheet = variant === "sheet";
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={label}
      {...bind}
      className={`group flex items-center gap-2.5 rounded-lg px-2.5 font-medium transition-colors ${
        sheet
          ? "min-h-11 justify-start py-2.5 text-base"
          : `py-2 text-[1.05rem] ${wide ? "justify-start" : "justify-center"}`
      } ${
        active
          ? "bg-aurora-400/10 text-aurora-300"
          : "text-mist-300 hover:bg-white/5 hover:text-mist-100"
      }`}
    >
      <Icon
        ref={ref}
        size={20}
        className={`flex shrink-0 ${
          active ? "text-aurora-300" : "text-mist-500 group-hover:text-aurora-300"
        }`}
        aria-hidden
      />
      <span className={sheet || wide ? "inline" : "hidden"}>{label}</span>
      {badge ? (
        <span
          data-testid="settings-quota-badge"
          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-amber-400"
          aria-label={badgeLabel ?? "Usage near plan limit"}
        />
      ) : null}
    </Link>
  );
}

function StudioNavSheet({
  open,
  onClose,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute("disabled"))
        : [];
    focusables()[0]?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const list = focusables();
      if (list.length === 0) return;
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,100%)] flex-col border-r border-white/10 bg-ink-950 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

function MotionIconControl({
  label,
  icon: Icon,
  onClick,
  className,
  size = 16,
}: {
  label: string;
  icon: AnimatedIcon;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  size?: number;
}) {
  const { ref, bind } = useIconMotion();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={className}
      {...bind}
    >
      <Icon ref={ref} size={size} className="flex" aria-hidden />
    </button>
  );
}

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
 * Studio chrome: labeled overlay nav below `lg`, expandable sidebar at `lg+`.
 * Settings opens from the account card / top-bar icon (not a Workspace nav item).
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
  const { warn: quotaWarn } = useQuotaHint();

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
    if (status === "loading") return;
    // Local / demo: studio is already usable. Don't drop a sign-in overlay
    // on top of Search — Sign in stays on the account card.
    if (!authRequired && status !== "authenticated") {
      markGuestSession();
      return;
    }
    if (authRequired && status === "unauthenticated") {
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
  const [navOpen, setNavOpen] = useState(false);
  const navTitleId = useId();
  const closeNav = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
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
      icon: AnimatedIcon;
      active: boolean;
    }[];
  }[] = [
    {
      label: "Overview",
      items: [
        {
          href: "/app?view=dashboard",
          label: "Dashboard",
          icon: LayoutGridIcon,
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
          icon: FolderKanbanIcon,
          active: onApp && displayView === "pipeline",
        },
        {
          href: "/app?view=conversations",
          label: "Conversations",
          icon: MessagesSquareIcon,
          active: onApp && displayView === "conversations",
        },
        {
          href: "/app?view=outreach",
          label: "Outreach",
          icon: MailboxIcon,
          active: onApp && displayView === "outreach",
        },
        {
          href: "/app?view=calendar",
          label: "Calendar",
          icon: CalendarDaysIcon,
          active: onApp && displayView === "calendar",
        },
        {
          href: "/app?view=contacts",
          label: "Collaborators",
          icon: ContactIcon,
          active: onApp && displayView === "contacts",
        },
      ],
    },
    {
      label: "Organize",
      items: [
        {
          href: "/app?view=boards",
          label: "Boards",
          icon: LayersIcon,
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
                icon: ShieldCheckIcon,
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
  const viewTitle = studioViewTitle(settingsActive, displayView);
  const showBoardChrome =
    displayView !== "admin" && displayView !== "admin-users";

  const renderNavItems = (variant: "rail" | "sheet") =>
    navSections.map((section) => (
      <div
        key={section.label}
        className={`flex flex-col ${variant === "sheet" ? "gap-0.5" : "gap-1"}`}
      >
        <p
          className={`px-3 text-[0.9rem] uppercase tracking-wider text-mist-500 ${
            variant === "sheet" ? "mb-0 mt-0.5" : "mb-0.5"
          } ${variant === "sheet" || wide ? "block" : "hidden"}`}
        >
          {section.label}
        </p>
        {section.items.map((item) => {
          const viewKey = (() => {
            const q = item.href.indexOf("?");
            if (q < 0) return "";
            return new URLSearchParams(item.href.slice(q + 1)).get("view") ?? "";
          })();
          return (
            <StudioNavLink
              key={item.href}
              href={boardHref(item.href)}
              label={item.label}
              icon={item.icon}
              active={item.active}
              wide={wide}
              variant={variant}
              onNavigate={() => {
                setPendingNavView(viewKey);
                if (variant === "sheet") closeNav();
              }}
            />
          );
        })}
      </div>
    ));

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden lg:flex-row">
      <div className="pointer-events-none fixed inset-0 -z-10 aurora-glow opacity-40" />

      <header className="sticky top-0 z-40 flex shrink-0 items-center gap-2 border-b border-white/5 bg-ink-950/90 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
        <button
          type="button"
          aria-expanded={navOpen}
          aria-controls="studio-nav-sheet"
          aria-label={navOpen ? "Close menu" : "Open menu"}
          onClick={() => setNavOpen((v) => !v)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-mist-100 transition-colors hover:border-white/20"
        >
          {navOpen ? (
            <XIcon className="h-4 w-4" />
          ) : (
            <span className="flex flex-col gap-1" aria-hidden>
              <span className="block h-0.5 w-4 rounded-full bg-mist-100" />
              <span className="block h-0.5 w-4 rounded-full bg-mist-100" />
              <span className="block h-0.5 w-3 rounded-full bg-mist-100" />
            </span>
          )}
        </button>
        <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-mist-100">
          {viewTitle}
        </p>
        {showBoardChrome ? (
          <MobileBoardButton
            boards={boards}
            activeBoardId={activeBoardId}
            onChange={setBoardFilter}
            variant="bar"
          />
        ) : null}
      </header>

      <aside
        className={`sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-white/5 bg-ink-950/90 py-3 backdrop-blur-xl transition-[width] duration-200 ease-out lg:flex ${
          wide ? "relative w-[16.5rem] px-3" : "relative w-16"
        }`}
      >
        {wide ? (
          <MotionIconControl
            label="Collapse sidebar"
            icon={ChevronLeftIcon}
            onClick={toggleSidebarCollapsed}
            className="absolute right-2 top-3 z-10 inline-flex rounded-lg p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100"
          />
        ) : (
          <MotionIconControl
            label="Expand sidebar"
            icon={ChevronRightIcon}
            onClick={toggleSidebarCollapsed}
            className="mb-3 inline-flex items-center justify-center self-center rounded-lg p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100"
          />
        )}

        <Link
          href="/"
          className={`mb-3 flex px-1 transition-opacity hover:opacity-80 ${
            wide ? "justify-start pr-8" : "justify-center"
          }`}
        >
          {wide ? (
            <BrandMark />
          ) : (
            <BrandMark size="sm" withWordmark={false} />
          )}
        </Link>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {renderNavItems("rail")}
        </nav>

        <div className="mt-auto border-t border-white/5 pt-3">
          {wide && showBoardChrome ? (
            <div className="mb-2">
              <BoardPicker
                boards={boards}
                activeBoardId={activeBoardId}
                onChange={setBoardFilter}
              />
            </div>
          ) : null}

          {wide ? (
            <Link
              href="/app/settings"
              className={`relative block rounded-xl border p-2 transition-colors ${
                settingsActive
                  ? "border-aurora-400/30 bg-aurora-400/10"
                  : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
              }`}
              title="Open settings"
            >
              {quotaWarn ? (
                <span
                  data-testid="settings-quota-badge"
                  className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-400"
                  aria-label="Usage near plan limit"
                />
              ) : null}
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aurora-400/15 text-xs font-semibold text-aurora-300">
                  {signedIn ? (displayName?.[0] ?? userEmail?.[0] ?? "U").toUpperCase() : "G"}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[16px] font-medium text-mist-100">
                    {signedIn ? (displayName ?? userEmail ?? "Account") : "Guest"}
                  </p>
                  <p className="truncate text-[13px] text-mist-500">
                    {signedIn && userEmail && displayName
                      ? userEmail
                      : "Settings"}
                  </p>
                </div>
                {signedIn ? (
                  <MotionIconControl
                    label="Sign out"
                    icon={LogoutIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void signOut({ callbackUrl: "/" });
                    }}
                    className="rounded-lg p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-200"
                  />
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
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Link
                href="/app/settings"
                title="Settings"
                className={`relative rounded-xl p-2.5 transition-colors ${
                  settingsActive
                    ? "bg-aurora-400/10 text-aurora-300"
                    : "text-mist-500 hover:bg-white/5 hover:text-aurora-300"
                }`}
              >
                <SettingsIcon size={20} className="flex" aria-hidden />
                {quotaWarn ? (
                  <span
                    data-testid="settings-quota-badge"
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400"
                    aria-label="Usage near plan limit"
                  />
                ) : null}
              </Link>
              {signedIn ? (
                <MotionIconControl
                  label="Sign out"
                  icon={LogoutIcon}
                  size={20}
                  onClick={() => void signOut({ callbackUrl: "/" })}
                  className="rounded-xl p-2.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-200"
                />
              ) : (
                <MotionIconControl
                  label="Sign in"
                  icon={MailboxIcon}
                  size={20}
                  onClick={() => setAuthOpen(true)}
                  className="rounded-xl p-2.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-aurora-300"
                />
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>

      <StudioNavSheet
        open={navOpen}
        onClose={closeNav}
        titleId={navTitleId}
      >
        <div id="studio-nav-sheet" className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <Link href="/" onClick={closeNav} className="transition-opacity hover:opacity-80">
              <BrandMark />
            </Link>
            <button
              type="button"
              onClick={closeNav}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-mist-400 transition-colors hover:bg-white/5 hover:text-mist-100"
              aria-label="Close menu"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <h2 id={navTitleId} className="sr-only">
            Studio navigation
          </h2>
          <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain pb-3 [mask-image:linear-gradient(to_bottom,transparent,#000_0.75rem,#000_calc(100%-1.25rem),transparent)]">
            {renderNavItems("sheet")}
          </nav>
          <div className="mt-2 shrink-0 border-t border-white/5 pt-2">
            <div className="mb-2">
              <StudioNavLink
                href="/app/settings"
                label="Settings"
                icon={SettingsIcon}
                active={settingsActive}
                wide
                variant="sheet"
                badge={quotaWarn}
                badgeLabel="Usage near plan limit — open Settings"
                onNavigate={closeNav}
              />
            </div>
            <Link
              href="/app/settings"
              onClick={closeNav}
              className={`block rounded-xl border p-2 transition-colors ${
                settingsActive
                  ? "border-aurora-400/30 bg-aurora-400/10"
                  : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
              }`}
              title="Open settings"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aurora-400/15 text-xs font-semibold text-aurora-300">
                  {signedIn ? (displayName?.[0] ?? userEmail?.[0] ?? "U").toUpperCase() : "G"}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-base font-medium text-mist-100">
                    {signedIn ? (displayName ?? userEmail ?? "Account") : "Guest"}
                  </p>
                  <p className="truncate text-sm text-mist-500">
                    {signedIn && userEmail && displayName
                      ? userEmail
                      : "Settings"}
                  </p>
                </div>
                {signedIn ? (
                  <MotionIconControl
                    label="Sign out"
                    icon={LogoutIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      closeNav();
                      void signOut({ callbackUrl: "/" });
                    }}
                    className="rounded-lg p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-200"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      closeNav();
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
        </div>
      </StudioNavSheet>

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

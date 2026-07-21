"use client";

/**
 * Product tour — coach marks: Search → Pipeline → Table → Settings → Resend.
 * Force via /app?setup=1.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowIcon, XIcon } from "@/components/icons";
import { readMigratedKey } from "@/lib/browser-storage";
import { loadStoredBoardFilter } from "@/components/studio/BoardPicker";
import { api } from "@/lib/client-api";

export const BOARD_REFRESH_EVENT = "hermes:board-refresh";

export const GETTING_STARTED_KEY = "hermes_getting_started_v3";
const GETTING_STARTED_LEGACY = [
  "leadify_getting_started_v3",
  "lodestar_getting_started_v3",
];
const FORCE_TUTORIAL_KEY = "hermes_force_tutorial";

function storageKeyForUser(userId?: string | null): string {
  return userId ? `${GETTING_STARTED_KEY}:${userId}` : GETTING_STARTED_KEY;
}

/**
 * Tour completion is per-user when signed in. New signups set
 * `hermes_force_tutorial` so a prior guest Skip on the same browser cannot
 * suppress the tour.
 */
export function isGettingStartedDone(userId?: string | null): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(FORCE_TUTORIAL_KEY) === "1") return false;
  } catch {
    /* ignore */
  }
  if (userId) {
    const keyed = localStorage.getItem(storageKeyForUser(userId));
    if (keyed === "done") return true;
    // Returning accounts: migrate a pre-per-user “done” once. New signups
    // never hit this while force_tutorial is set.
    const globalDone =
      readMigratedKey(GETTING_STARTED_KEY, GETTING_STARTED_LEGACY) === "done";
    if (globalDone) {
      try {
        localStorage.setItem(storageKeyForUser(userId), "done");
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
  }
  return readMigratedKey(GETTING_STARTED_KEY, GETTING_STARTED_LEGACY) === "done";
}

export function markGettingStartedDone(userId?: string | null): void {
  try {
    sessionStorage.removeItem(FORCE_TUTORIAL_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(storageKeyForUser(userId), "done");
    if (userId) localStorage.setItem(GETTING_STARTED_KEY, "done");
  } catch {
    /* ignore */
  }
}

export interface GettingStartedCaps {
  canSearchLive: boolean;
  canSendEmail: boolean;
  firecrawl: boolean;
  resend: boolean;
  smtp: boolean;
}

export interface GettingStartedIdentity {
  fromName: string;
  fromEmail: string;
  physicalAddress: string;
}

type TourStep = {
  id: string;
  path: string;
  target: string | null;
  title: string;
  body: string;
  prefer?: "below" | "above" | "right" | "left";
  /** Extra spotlight padding (px) */
  pad?: number;
  /** scrollIntoView block */
  scrollBlock?: ScrollLogicalPosition;
};

function buildSteps(): TourStep[] {
  return [
    {
      id: "welcome",
      path: "/app",
      target: null,
      title: "Welcome to HERMES mail",
      body: "Search a niche, review leads on the pipeline, then approve every email before it goes out. Nothing sends without you.",
    },
    {
      id: "search",
      path: "/app",
      target: '[data-tour="search-panel"]',
      prefer: "right",
      title: "Start with a search",
      body: "Describe who you want, pick a location from the suggestions, choose how many leads, then hit Find leads.",
    },
    {
      id: "pipeline",
      path: "/app?view=pipeline",
      target: '[data-tour="pipeline-board"]',
      prefer: "right",
      title: "Work the pipeline",
      body: "Drag a card between stages, click ⓘ for details.",
      scrollBlock: "start",
    },
    {
      id: "table",
      path: "/app?view=leads",
      target: '[data-tour="leads-table"]',
      prefer: "above",
      title: "Browse all leads",
      body: "The Leads tab holds the full list — table, cards, or map. Export if desired.",
      scrollBlock: "center",
    },
    {
      id: "outreach",
      path: "/app?view=outreach",
      target: '[data-tour="outreach-queue"]',
      prefer: "right",
      title: "Send from Outreach",
      body: "Draft → approve → send lives here.",
      scrollBlock: "start",
    },
    {
      id: "settings",
      path: "/app/settings",
      target: '[data-tour="sending-identity"]',
      prefer: "right",
      title: "Set who you send as",
      body: "Your from name and from email. This is how you show up in the inbox.",
      scrollBlock: "start",
    },
    {
      id: "resend",
      path: "/app/settings",
      target: '[data-tour="resend-key"]',
      prefer: "left",
      pad: 14,
      title: "Bring your own sender",
      body: "For real inbox delivery, pick Resend or Maileroo, paste your API key, and send from your verified domain.",
      scrollBlock: "center",
    },
    {
      id: "done",
      path: "/app",
      target: null,
      title: "You’re ready",
      body: "Try a search, review drafts under Outreach, and only approve what you’d send yourself.",
    },
  ];
}

type TipPos = { top: number; left: number; transform?: string };

function placeTip(
  rect: DOMRect | null,
  prefer: TourStep["prefer"],
  tipW = 352,
  tipH = 240,
): TipPos {
  const margin = 16;
  const gap = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    return { top: vh / 2, left: vw / 2, transform: "translate(-50%, -50%)" };
  }

  const spaceBelow = vh - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const spaceRight = vw - rect.right - margin;
  const spaceLeft = rect.left - margin;

  let placement = prefer ?? "right";

  // Honor prefer when there's room; otherwise pick the roomiest side.
  const rooms: Record<string, number> = {
    below: spaceBelow,
    above: spaceAbove,
    right: spaceRight,
    left: spaceLeft,
  };
  const need = placement === "left" || placement === "right" ? tipW : tipH;
  if ((rooms[placement] ?? 0) < need + gap) {
    placement = (Object.entries(rooms).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "right") as NonNullable<TourStep["prefer"]>;
  }

  let top = 0;
  let left = 0;

  if (placement === "below") {
    top = Math.min(rect.bottom + gap, vh - tipH - margin);
    left = clamp(rect.left + rect.width / 2 - tipW / 2, margin, vw - tipW - margin);
  } else if (placement === "above") {
    top = Math.max(margin, rect.top - tipH - gap);
    left = clamp(rect.left + rect.width / 2 - tipW / 2, margin, vw - tipW - margin);
  } else if (placement === "right") {
    top = clamp(rect.top + Math.min(rect.height / 2, 80) - 40, margin, vh - tipH - margin);
    left = Math.min(rect.right + gap, vw - tipW - margin);
  } else {
    top = clamp(rect.top + Math.min(rect.height / 2, 80) - 40, margin, vh - tipH - margin);
    left = Math.max(margin, rect.left - tipW - gap);
  }

  return { top, left };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Keep the sidebar board filter on tour navigations so StudioShell doesn’t
 *  immediately `replace` a second time (that double-render feels like lag). */
function withBoardFilter(path: string): string {
  if (path.startsWith("/app/settings")) return path;
  try {
    const stored = loadStoredBoardFilter();
    if (!stored || stored === "all") return path;
    if (/(?:^|[?&])board=/.test(path)) return path;
    return `${path}${path.includes("?") ? "&" : "?"}board=${encodeURIComponent(stored)}`;
  } catch {
    return path;
  }
}

function pathMatches(
  pathname: string,
  searchParams: URLSearchParams,
  want: string,
): boolean {
  const view = searchParams.get("view");
  const here = pathname.startsWith("/app/settings")
    ? "/app/settings"
    : view === "pipeline"
      ? "/app?view=pipeline"
      : view === "leads"
        ? "/app?view=leads"
        : view === "outreach"
          ? "/app?view=outreach"
          : view === "runs"
            ? "/app?view=runs"
            : "/app";
  return here === want;
}

/** Side-burst confetti — shoots in from left & right. */
function fireConfetti() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:80";
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const colors = ["#43e0a8", "#7ff2c8", "#f7b955", "#ffd48a", "#eaf1fb", "#16c390"];
  const W = window.innerWidth;
  const H = window.innerHeight;
  const pieces = Array.from({ length: 160 }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? -10 - Math.random() * 40 : W + 10 + Math.random() * 40,
      y: H * (0.15 + Math.random() * 0.7),
      w: 5 + Math.random() * 8,
      h: 8 + Math.random() * 12,
      vx: (fromLeft ? 1 : -1) * (8 + Math.random() * 14),
      vy: -6 - Math.random() * 10,
      rot: Math.random() * Math.PI * 2,
      vr: -0.35 + Math.random() * 0.7,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      gravity: 0.18 + Math.random() * 0.12,
    };
  });

  const start = performance.now();
  const tick = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of pieces) {
      p.x += p.vx * 0.85;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.992;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - t / 2800);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 2800) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

export function GettingStartedWizard({
  open,
  onClose,
  userId = null,
}: {
  open: boolean;
  onClose: () => void;
  caps?: GettingStartedCaps;
  identity?: GettingStartedIdentity;
  /** Auth.js user id — scopes the “done” flag per account. */
  userId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [anchored, setAnchored] = useState(false);
  /** If the target never mounts, show the tip centered once (no slide). */
  const [fallbackCenter, setFallbackCenter] = useState(false);
  /** Final tip placement for this step — set once so it never slides. */
  const [tipPos, setTipPos] = useState<TipPos | null>(null);
  const measuringRef = useRef(false);
  const seededRef = useRef(false);

  const STEPS = useMemo(() => buildSteps(), []);
  const current = STEPS[step] ?? STEPS[0]!;
  const isLast = step === STEPS.length - 1;
  const onCorrectPath = pathMatches(pathname, searchParams, current.path);

  const finish = useCallback(
    (celebrate = false) => {
      markGettingStartedDone(userId);
      if (celebrate) fireConfetti();
      onClose();
    },
    [onClose, userId],
  );

  const resetTip = useCallback(() => {
    setAnchored(false);
    setRect(null);
    setFallbackCenter(false);
    setTipPos(null);
  }, []);

  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    setStep(0);
    resetTip();
  }, [open, resetTip]);

  // Seed sample leads once so Pipeline / Leads / Outreach show real UI, not
  // “Your board is clear”. Free, offline demo — no provider credits.
  useEffect(() => {
    if (!open || seededRef.current) return;
    seededRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.board(null);
        if (cancelled || (data.leads?.length ?? 0) > 0) return;
        const def =
          data.boards?.find((b) => b.isDefault)?.id ?? data.boards?.[0]?.id;
        await api.createRun({
          niche: "boutique dental clinics",
          location: "Austin, TX",
          offerNotes:
            "We build booking sites that turn website visitors into scheduled appointments.",
          demo: true,
          autoDraft: true,
          maxLeads: 6,
          boardId: def,
        });
        if (!cancelled) {
          window.dispatchEvent(new Event(BOARD_REFRESH_EVENT));
        }
      } catch (err) {
        console.error("[tour] demo seed failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Navigate when the step path differs — once per step (include board filter
  // so the shell doesn’t fire a second replace).
  useEffect(() => {
    if (!open) return;
    if (!onCorrectPath) {
      resetTip();
      router.replace(withBoardFilter(current.path), { scroll: false });
    }
  }, [open, step, current.path, onCorrectPath, router, resetTip]);

  // Safety: if the spotlight target never appears, still show the tip centered.
  useEffect(() => {
    if (!open) return;
    if (!current.target) {
      setFallbackCenter(false);
      return;
    }
    setFallbackCenter(false);
    const t = window.setTimeout(() => setFallbackCenter(true), 800);
    return () => window.clearTimeout(t);
  }, [open, step, current.target]);

  const measure = useCallback(() => {
    if (!open) return;
    if (!current.target) {
      setRect(null);
      setAnchored(true);
      return;
    }
    if (!onCorrectPath) {
      return;
    }
    const el = document.querySelector(current.target);
    if (!el) {
      return;
    }
    if (!measuringRef.current) {
      measuringRef.current = true;
      el.scrollIntoView({
        block: current.scrollBlock ?? "nearest",
        // Instant: smooth scroll re-fires measure via scroll listeners → tip jump.
        behavior: "auto",
      });
      window.setTimeout(() => {
        measuringRef.current = false;
      }, 200);
    }
    const next = el.getBoundingClientRect();
    // Ignore zero-size flashes during layout
    if (next.width < 8 || next.height < 8) {
      return;
    }
    setRect(next);
    setAnchored(true);
  }, [open, current.target, current.scrollBlock, onCorrectPath]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    // Retry through view mount + demo seed paint.
    const timers = [50, 200, 450, 900, 1600].map((ms) =>
      window.setTimeout(measure, ms),
    );
    const onResize = () => measure();
    let scrollTimer = 0;
    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(measure, 80);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    const onRefresh = () => {
      window.setTimeout(measure, 80);
      window.setTimeout(measure, 400);
    };
    window.addEventListener(BOARD_REFRESH_EVENT, onRefresh);
    return () => {
      timers.forEach(clearTimeout);
      window.clearTimeout(scrollTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener(BOARD_REFRESH_EVENT, onRefresh);
    };
  }, [open, step, measure, pathname, searchParams]);

  // Lock placement once — tip mounts at its final spot (no center→side tween).
  useLayoutEffect(() => {
    if (!open || tipPos) return;
    if (!current.target) {
      setTipPos(placeTip(null, current.prefer));
      return;
    }
    if (anchored && rect) {
      setTipPos(placeTip(rect, current.prefer));
      return;
    }
    if (fallbackCenter) {
      setTipPos(placeTip(null, current.prefer));
    }
  }, [open, tipPos, current.target, current.prefer, anchored, rect, fallbackCenter]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) return null;

  const pad = current.pad ?? 10;
  const tipStyle: React.CSSProperties | undefined = tipPos
    ? {
        top: tipPos.top,
        left: tipPos.left,
        ...(tipPos.transform ? { transform: tipPos.transform } : {}),
      }
    : undefined;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && anchored && current.target && (
              <rect
                x={rect.left - pad}
                y={rect.top - pad}
                width={rect.width + pad * 2}
                height={rect.height + pad * 2}
                rx="16"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(6,10,18,0.78)" mask="url(#tour-mask)" />
        {rect && anchored && current.target && (
          <rect
            x={rect.left - pad}
            y={rect.top - pad}
            width={rect.width + pad * 2}
            height={rect.height + pad * 2}
            rx="16"
            fill="none"
            stroke="rgba(67,224,168,0.7)"
            strokeWidth="2.5"
            className="tour-pulse-ring"
          />
        )}
      </svg>

      {tipPos ? (
        <div
          key={current.id}
          className="pointer-events-auto absolute z-[71] w-[min(100%-2rem,22rem)]"
          style={tipStyle}
        >
          <div className="relative animate-float-up rounded-xl2 border border-aurora-400/25 bg-ink-900 p-5 shadow-2xl shadow-black/50">
            <button
              type="button"
              onClick={() => finish(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-mist-500 hover:bg-white/5 hover:text-mist-100"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>

            <div className="mb-3 flex gap-1.5">
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= step ? "bg-aurora-400" : "bg-white/10"
                  }`}
                />
              ))}
            </div>

            <p className="text-[11px] uppercase tracking-widest text-aurora-300">
              Tour · {step + 1} / {STEPS.length}
            </p>
            <h2 id="tour-title" className="mt-2 pr-6 font-display text-xl font-semibold text-mist-100">
              {current.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-mist-300">{current.body}</p>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => finish(false)}
                className="text-sm text-mist-500 hover:text-mist-200"
              >
                Skip
              </button>
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      resetTip();
                      setStep((s) => s - 1);
                    }}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-mist-100 hover:bg-white/5"
                  >
                    Back
                  </button>
                )}
                {!isLast ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetTip();
                      setStep((s) => s + 1);
                    }}
                    className="group inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-4 py-1.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02]"
                  >
                    Next
                    <ArrowIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      finish(true);
                      router.replace(withBoardFilter("/app"), { scroll: false });
                    }}
                    className="group inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-4 py-1.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02]"
                  >
                    Start searching
                    <ArrowIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Hook: reopen when ?setup=1. First-visit open is handled by StudioShell. */
export function useGettingStartedOpen(): {
  open: boolean;
  setOpen: (v: boolean) => void;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("setup") !== "1") return;
    setOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("setup");
    const qs = url.searchParams.toString();
    router.replace(url.pathname + (qs ? `?${qs}` : "") || "/app");
  }, [searchParams, router]);

  return { open, setOpen };
}

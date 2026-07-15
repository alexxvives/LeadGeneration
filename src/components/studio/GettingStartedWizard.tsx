"use client";

/**
 * Product tour — coach marks that walk Search → Pipeline → Settings.
 * Replaces the old checklist modal. Reopen via Settings or /app?setup=1.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowIcon, XIcon } from "@/components/icons";

export const GETTING_STARTED_KEY = "lodestar_getting_started_v3";

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
  /** App path to show this step on */
  path: string;
  /** CSS selector for spotlight; null = centered card */
  target: string | null;
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    id: "welcome",
    path: "/app",
    target: null,
    title: "Welcome to Lodestar",
    body: "Find leads, put them on a map and pipeline, then approve every email before it sends. This short tour shows where everything lives.",
  },
  {
    id: "search",
    path: "/app",
    target: '[data-tour="search-panel"]',
    title: "Start with a search",
    body: "Describe who you want (niche) and pick a place from the location suggestions — don’t free-type a city. Then hit Find leads.",
  },
  {
    id: "pipeline",
    path: "/app?view=pipeline",
    target: '[data-tour="pipeline"]',
    title: "Work the pipeline",
    body: "New leads land here. Draft, approve, and drag cards through Contacted → In Conversation → Closed. Nothing sends without your say-so.",
  },
  {
    id: "settings",
    path: "/app/settings",
    target: '[data-tour="sending-identity"]',
    title: "Set who you send as",
    body: "Fill From name, From email, and mailing address before real outreach. You can replay this tour anytime from Settings.",
  },
];

export function GettingStartedWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  caps?: GettingStartedCaps;
  identity?: GettingStartedIdentity;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const finish = useCallback(() => {
    try {
      localStorage.setItem(GETTING_STARTED_KEY, "done");
    } catch {
      /* ignore */
    }
    onClose();
  }, [onClose]);

  // Always open on step 1 (index 0) — never jump to first incomplete checklist item.
  useEffect(() => {
    if (!open) return;
    setStep(0);
  }, [open]);

  // Navigate to the path for the current step.
  useEffect(() => {
    if (!open) return;
    const view = searchParams.get("view");
    const here =
      pathname.startsWith("/app/settings")
        ? "/app/settings"
        : view === "pipeline"
          ? "/app?view=pipeline"
          : view === "runs"
            ? "/app?view=runs"
            : "/app";
    if (here !== current.path) {
      router.push(current.path);
    }
  }, [open, step, current.path, pathname, searchParams, router]);

  const measure = useCallback(() => {
    if (!open || !current.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(current.target);
    if (!el) {
      setRect(null);
      return;
    }
    setRect(el.getBoundingClientRect());
  }, [open, current.target]);

  useLayoutEffect(() => {
    measure();
    if (!open) return;
    const id = window.setTimeout(measure, 180);
    const id2 = window.setTimeout(measure, 500);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(id2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, measure, pathname, searchParams]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) return null;

  const pad = 8;
  const tipStyle: React.CSSProperties = rect
    ? {
        top: Math.min(rect.bottom + 12, window.innerHeight - 220),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 360)),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
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
        <rect width="100%" height="100%" fill="rgba(6,10,18,0.72)" mask="url(#tour-mask)" />
      </svg>

      <div
        className="pointer-events-auto absolute z-[71] w-[min(100%-2rem,22rem)] animate-float-up rounded-xl2 border border-white/10 bg-ink-900 p-5 shadow-2xl shadow-black/50"
        style={tipStyle}
      >
        <button
          type="button"
          onClick={finish}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-mist-500 hover:bg-white/5 hover:text-mist-100"
          aria-label="Close"
        >
          <XIcon className="h-4 w-4" />
        </button>

        <p className="text-[11px] uppercase tracking-widest text-aurora-300">
          Tour · {step + 1} / {STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-2 font-display text-xl font-semibold text-mist-100">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist-300">{current.body}</p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-sm text-mist-500 hover:text-mist-200"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-mist-100 hover:bg-white/5"
              >
                Back
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="group inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-4 py-1.5 text-sm font-medium text-ink-950 hover:scale-[1.02]"
              >
                Next
                <ArrowIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  finish();
                  router.push("/app");
                }}
                className="group inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-4 py-1.5 text-sm font-medium text-ink-950 hover:scale-[1.02]"
              >
                Start searching
                <ArrowIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
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

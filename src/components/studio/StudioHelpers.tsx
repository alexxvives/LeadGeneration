"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui";
import { SparkIcon } from "@/components/icons";

export function LayoutToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 font-medium transition-colors ${
        active ? "bg-white/10 text-mist-100" : "text-mist-500 hover:text-mist-300"
      }`}
    >
      {children}
    </button>
  );
}

/** Compact empty — dashed frame, display title, optional body and aurora CTA. */
export function EmptyState({
  title = "Your board is clear",
  body = "Search a niche, import a list, or add a lead by hand — then send one at a time.",
  actionHref = "/app",
  actionLabel = "Find leads",
  showAction = true,
}: {
  title?: string;
  body?: string;
  actionHref?: string;
  actionLabel?: string;
  showAction?: boolean;
}) {
  return (
    <div className="rounded-xl2 border border-dashed border-white/10 px-6 py-10 text-center sm:px-8">
      <SparkIcon className="mx-auto h-7 w-7 text-aurora-300" />
      <h2 className="mt-3 font-display text-xl font-semibold text-mist-100">{title}</h2>
      {body ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-mist-300">{body}</p>
      ) : null}
      {showAction ? (
        <Link
          href={actionHref}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400/70"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

/** Page-level load failure. Inline field errors stay as text. */
export function ErrorBanner({
  children,
  onRetry,
}: {
  children: React.ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded-xl2 border border-rose-400/20 bg-rose-400/5 px-5 py-4 text-sm text-rose-200"
      role="alert"
    >
      {children}
      {onRetry ? (
        <button
          type="button"
          className="ml-3 text-aurora-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400/70"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** One scrolling row of note actions in the lead and collaborator drawers. */
export const noteActionRowClass =
  "flex min-w-0 flex-nowrap items-center justify-end gap-x-2.5 overflow-x-auto [scrollbar-width:thin]";

export function noteActionClass(tone: "amber" | "violet" | "aurora" | "mist") {
  const color = {
    amber: "text-amber-300",
    violet: "text-violet-300",
    aurora: "text-aurora-300",
    mist: "text-mist-400",
  }[tone];
  return `shrink-0 whitespace-nowrap text-[11px] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400/60 disabled:opacity-50 ${color}`;
}

const SEARCH_PHASES = [
  "Querying the web…",
  "Opening company pages…",
  "Pulling emails & phones…",
  "Scoring fit…",
] as const;

/** Indeterminate progress while a run is in flight (one blocking request). */
export function SearchProgress({ running }: { running: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!running) {
      setPhase(0);
      return;
    }
    setPhase(0);
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % SEARCH_PHASES.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [running]);

  if (!running) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-xl2 border border-aurora-400/20 bg-aurora-400/5 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-aurora-200">{SEARCH_PHASES[phase]}</p>
        <Spinner className="h-4 w-4 text-aurora-300" />
      </div>
      <div className="meter-track mt-3 h-1.5 overflow-hidden rounded-full">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-aurora-400" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-14 rounded-lg border border-white/5 bg-ink-950/40 shimmer"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-mist-500">
        Working… leads appear when the run finishes — then we open Pipeline.
      </p>
    </div>
  );
}

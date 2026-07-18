"use client";

import { useEffect, useState } from "react";
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
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-medium transition-colors ${
        active ? "bg-white/10 text-mist-100" : "text-mist-500 hover:text-mist-300"
      }`}
    >
      {children}
    </button>
  );
}

/** Compact empty CTA — no full-bleed image/gradient (that bled into Search). */
export function EmptyState({
  onLoadDemo,
  running,
}: {
  onLoadDemo: () => void;
  running: boolean;
}) {
  return (
    <div className="rounded-xl2 border border-dashed border-white/10 px-6 py-10 text-center sm:px-8">
      <SparkIcon className="mx-auto h-7 w-7 text-aurora-300" />
      <h2 className="mt-3 font-display text-xl font-semibold text-mist-100">Your board is clear</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-mist-300">
        Run a search above, or load sample leads to try approve → send without spending provider
        credits.
      </p>
      <button
        type="button"
        onClick={onLoadDemo}
        disabled={running}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.03] disabled:opacity-50"
      >
        {running ? <Spinner className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}
        Load demo data
      </button>
    </div>
  );
}

const SEARCH_PHASES = [
  "Querying the web…",
  "Opening company pages…",
  "Pulling emails & phones…",
  "Scoring fit…",
] as const;

/** Staged progress while a run is in flight (search is still one blocking request). */
export function SearchProgress({ running }: { running: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!running) {
      setPhase(0);
      return;
    }
    setPhase(0);
    const id = window.setInterval(() => {
      setPhase((p) => Math.min(p + 1, SEARCH_PHASES.length - 1));
    }, 2200);
    return () => window.clearInterval(id);
  }, [running]);

  if (!running) return null;

  const pct = ((phase + 1) / SEARCH_PHASES.length) * 100;

  return (
    <div className="mt-4 overflow-hidden rounded-xl2 border border-aurora-400/20 bg-aurora-400/5 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-aurora-200">{SEARCH_PHASES[phase]}</p>
        <Spinner className="h-4 w-4 text-aurora-300" />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-950/60">
        <div
          className="h-full rounded-full bg-aurora-400 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
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
        Leads appear when the run finishes — then we jump you to Pipeline.
      </p>
    </div>
  );
}

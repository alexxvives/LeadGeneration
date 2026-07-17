"use client";

import Link from "next/link";
import { getPlan, PLAN_ORDER } from "@/lib/plans";
import type { PlanId } from "@/lib/types";
import { ArrowIcon, SparkIcon, XIcon } from "@/components/icons";

/**
 * Shown when the workspace hits a plan quota (402). Purely reflective — the
 * enforcement already happened server-side; this just points the user at
 * /pricing to upgrade (commercialization Phase 3/4).
 */
export function UpgradeModal({
  kind,
  planId,
  onClose,
}: {
  kind: "leads" | "sends";
  planId: PlanId;
  onClose: () => void;
}) {
  const plan = getPlan(planId);
  const nextId = PLAN_ORDER[Math.min(PLAN_ORDER.indexOf(planId) + 1, PLAN_ORDER.length - 1)];
  const next = getPlan(nextId);
  const label = kind === "leads" ? "lead credits" : "monthly sends";

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-6">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="glass animate-float-up relative w-full max-w-md rounded-xl2 p-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100"
          aria-label="Close"
        >
          <XIcon className="h-5 w-5" />
        </button>

        <div className="grid h-11 w-11 place-items-center rounded-full bg-amber-400/15 text-amber-300">
          <SparkIcon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold">You&apos;re out of {label}</h2>
        <p className="mt-2 text-sm text-mist-300">
          Your {plan.name} plan includes{" "}
          <span className="font-medium text-mist-100">
            {kind === "leads" ? plan.leadCreditsPerMonth : plan.sendsPerMonth}
          </span>{" "}
          {label} per month. Upgrade to {next.name} for{" "}
          <span className="font-medium text-mist-100">
            {kind === "leads" ? next.leadCreditsPerMonth : next.sendsPerMonth}
          </span>{" "}
          and keep going.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/pricing"
            className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-105"
          >
            See plans
            <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-sm text-mist-300 transition-colors hover:text-mist-100"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsageBar({
  label,
  used,
  limit,
  remaining,
}: {
  label: string;
  used?: number;
  limit?: number;
  /** Provider credit balance (e.g. Zeruh) — bar fills toward a soft full of 250. */
  remaining?: number;
}) {
  if (remaining != null) {
    // Soft full: MyEmailVerifier free day (~100) or Zeruh signup pack (~250).
    const softFull = remaining <= 120 ? 100 : 250;
    const pct = Math.min(100, Math.round((remaining / softFull) * 100));
    const tone =
      remaining <= 0 ? "bg-rose-400" : remaining < 25 ? "bg-amber-400" : "bg-aurora-400";
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="shrink-0 text-mist-300">{label}</span>
          <span className="min-w-0 truncate tabular-nums text-mist-500">
            {remaining.toLocaleString()} left
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${tone} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  const u = used ?? 0;
  const lim = limit ?? 0;
  const pct = lim > 0 ? Math.min(100, Math.round((u / lim) * 100)) : 0;
  const tone = pct >= 100 ? "bg-rose-400" : pct >= 80 ? "bg-amber-400" : "bg-aurora-400";
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="shrink-0 text-mist-300">{label}</span>
        <span className="min-w-0 truncate tabular-nums text-mist-500">
          {u} / {lim}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

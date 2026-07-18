"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import type { AdminPlatformStats, PlanId } from "@/lib/types";
import { getPlan } from "@/lib/plans";
import { Spinner } from "@/components/ui";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="glass rounded-xl2 p-5">
      <p className="text-[11px] uppercase tracking-wider text-mist-500">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-mist-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-mist-500">{hint}</p> : null}
    </div>
  );
}

const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "agency"];

export function AdminPlatformView() {
  const [data, setData] = useState<AdminPlatformStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .adminOverview()
      .then((s) => {
        if (!cancelled) setData(s);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return (
      <div className="rounded-xl2 border border-rose-400/20 bg-rose-400/5 px-5 py-4 text-sm text-rose-200">
        {err}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-mist-500">
        <Spinner className="h-4 w-4" /> Loading platform…
      </div>
    );
  }

  const maxPlan = Math.max(1, ...PLAN_ORDER.map((id) => data.byPlan[id] ?? 0));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-aurora-300">Admin</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-mist-100">
            Platform overview
          </h1>
          <p className="mt-2 max-w-xl text-sm text-mist-400">
            Cross-workspace health — workspaces, usage, and billing signals.
          </p>
        </div>
        <Link
          href="/app?view=admin-users"
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-mist-200 hover:border-aurora-400/40 hover:text-aurora-300"
        >
          View all users →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Workspaces" value={data.workspaceCount} />
        <StatCard label="Auth users" value={data.userCount} />
        <StatCard
          label="Paid plans"
          value={data.paidWorkspaceCount}
          hint={`${data.withStripeCustomer} with Stripe customer`}
        />
        <StatCard
          label="Total leads"
          value={data.totalLeads}
          hint={`${data.totalSendsLifetime} sends · ${data.totalRuns} runs`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Leads used (month)"
          value={data.leadsUsedThisMonth}
          hint="Sum of workspace counters"
        />
        <StatCard label="Sends used (month)" value={data.sendsUsedThisMonth} />
        <StatCard label="Verifies used (today)" value={data.verifiesUsedToday} />
        <StatCard
          label="Send setup"
          value={`${data.withEasySendKey + data.withMailbox}`}
          hint={`${data.withEasySendKey} Easy key · ${data.withMailbox} mailbox`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-xl2 p-5">
          <h2 className="text-sm font-semibold text-mist-100">Workspaces by plan</h2>
          <div className="mt-4 space-y-3">
            {PLAN_ORDER.map((id) => {
              const n = data.byPlan[id] ?? 0;
              const plan = getPlan(id);
              return (
                <div key={id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-mist-300">
                      {plan.name}
                      {plan.monthlyPrice > 0 ? (
                        <span className="text-mist-500"> · ${plan.monthlyPrice}/mo</span>
                      ) : null}
                    </span>
                    <span className="font-display text-mist-100">{n}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-950/60">
                    <div
                      className="h-full rounded-full bg-aurora-400 transition-all duration-700"
                      style={{ width: `${(n / maxPlan) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass rounded-xl2 p-5">
          <h2 className="text-sm font-semibold text-mist-100">Recent workspaces</h2>
          <ul className="mt-4 divide-y divide-white/5">
            {data.recentSignups.length === 0 ? (
              <li className="py-3 text-sm text-mist-500">No workspaces yet.</li>
            ) : (
              data.recentSignups.map((u) => (
                <li
                  key={u.workspaceId}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-mist-100">
                      {u.ownerEmail ?? u.workspaceName}
                    </p>
                    <p className="text-xs text-mist-500">
                      {getPlan(u.planId).name} · {u.leadCount} leads · {u.sentCount} sent
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-mist-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </time>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

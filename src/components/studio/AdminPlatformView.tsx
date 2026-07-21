"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import type { AdminPlatformStats, AdminUserRow, PlanId } from "@/lib/types";
import { getPlan, isPaidPlan } from "@/lib/plans";
import { Spinner } from "@/components/ui";
import { Select } from "@/components/ui/Select";

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "aurora" | "amber" | "mist";
}) {
  const valueTone =
    accent === "amber"
      ? "text-amber-300"
      : accent === "mist"
        ? "text-mist-100"
        : "text-aurora-300";
  return (
    <div className="glass rounded-xl2 p-5">
      <p className="text-[11px] uppercase tracking-wider text-mist-500">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold ${valueTone}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-mist-500">{hint}</p> : null}
    </div>
  );
}

const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "agency", "insider"];
const PLAN_COLORS: Record<PlanId, string> = {
  free: "bg-mist-500",
  starter: "bg-aurora-400/70",
  pro: "bg-aurora-400",
  agency: "bg-amber-400",
  insider: "bg-amber-300",
};

function statsForUsers(users: AdminUserRow[]): AdminPlatformStats {
  const byPlan: Record<PlanId, number> = {
    free: 0,
    starter: 0,
    pro: 0,
    agency: 0,
    insider: 0,
  };
  let totalLeads = 0;
  let totalSendsLifetime = 0;
  let totalRuns = 0;
  let leadsUsedThisMonth = 0;
  let sendsUsedThisMonth = 0;
  let verifiesUsedToday = 0;
  let paidWorkspaceCount = 0;
  let withStripeCustomer = 0;
  let withMailbox = 0;
  let withEasySendKey = 0;

  for (const u of users) {
    byPlan[u.planId] = (byPlan[u.planId] ?? 0) + 1;
    totalLeads += u.leadCount;
    totalSendsLifetime += u.sentCount;
    totalRuns += u.runCount;
    leadsUsedThisMonth += u.leadsUsedThisMonth;
    sendsUsedThisMonth += u.sendsUsedThisMonth;
    verifiesUsedToday += u.verifiesUsedToday;
    if (isPaidPlan(u.planId)) paidWorkspaceCount += 1;
    if (u.stripeCustomerId) withStripeCustomer += 1;
    if (u.hasMailbox) withMailbox += 1;
    if (u.hasEasySendKey) withEasySendKey += 1;
  }

  const recentSignups = [...users]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  return {
    workspaceCount: users.length,
    userCount: users.filter((u) => u.ownerUserId).length,
    totalLeads,
    totalSendsLifetime,
    totalRuns,
    leadsUsedThisMonth,
    sendsUsedThisMonth,
    verifiesUsedToday,
    byPlan,
    paidWorkspaceCount,
    withStripeCustomer,
    withMailbox,
    withEasySendKey,
    recentSignups,
  };
}

/** Signups per day for the last N days (from createdAt). */
function signupSeries(users: AdminUserRow[], days = 14): { label: string; n: number }[] {
  const now = new Date();
  const buckets: { key: string; label: string; n: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    const key = d.toISOString().slice(0, 10);
    buckets.push({
      key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      n: 0,
    });
  }
  const map = new Map(buckets.map((b) => [b.key, b]));
  for (const u of users) {
    const key = u.createdAt.slice(0, 10);
    const b = map.get(key);
    if (b) b.n += 1;
  }
  return buckets.map(({ label, n }) => ({ label, n }));
}

function DonutPlan({ byPlan }: { byPlan: Record<PlanId, number> }) {
  const total = Math.max(1, PLAN_ORDER.reduce((s, id) => s + (byPlan[id] ?? 0), 0));
  let acc = 0;
  const segments = PLAN_ORDER.map((id) => {
    const n = byPlan[id] ?? 0;
    const start = (acc / total) * 360;
    acc += n;
    const end = (acc / total) * 360;
    return { id, n, start, end };
  }).filter((s) => s.n > 0);

  // Conic gradient from segment angles
  const stops =
    segments.length === 0
      ? "rgb(127 146 179 / 0.25) 0deg 360deg"
      : segments
          .map((s) => {
            const color =
              s.id === "free"
                ? "rgb(127 146 179 / 0.55)"
                : s.id === "starter"
                  ? "rgb(45 212 191 / 0.55)"
                  : s.id === "pro"
                    ? "rgb(45 212 191)"
                    : s.id === "agency"
                      ? "rgb(251 191 36)"
                      : "rgb(252 211 77)";
            return `${color} ${s.start}deg ${s.end}deg`;
          })
          .join(", ");

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="relative h-36 w-36 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        aria-hidden
      >
        <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-ink-950/90">
          <p className="font-display text-2xl font-semibold text-mist-100">{total}</p>
          <p className="text-[10px] uppercase tracking-wider text-mist-500">workspaces</p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {PLAN_ORDER.map((id) => {
          const n = byPlan[id] ?? 0;
          const pct = Math.round((n / total) * 100);
          return (
            <li key={id} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PLAN_COLORS[id]}`} />
              <span className="flex-1 truncate text-mist-300">{getPlan(id).name}</span>
              <span className="tabular-nums text-mist-100">
                {n}
                <span className="ml-1 text-mist-500">({pct}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BarChart({
  title,
  series,
}: {
  title: string;
  series: { label: string; n: number }[];
}) {
  const max = Math.max(1, ...series.map((s) => s.n));
  return (
    <div className="glass rounded-xl2 p-5">
      <h2 className="text-sm font-semibold text-mist-100">{title}</h2>
      <div className="mt-4 flex h-40 items-end gap-1.5">
        {series.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-mist-500">
              {s.n > 0 ? s.n : ""}
            </span>
            <div
              className="w-full rounded-t-md bg-aurora-400/80 transition-all duration-500"
              style={{ height: `${Math.max(s.n > 0 ? 8 : 2, (s.n / max) * 100)}%` }}
              title={`${s.label}: ${s.n}`}
            />
            <span className="truncate text-[9px] text-mist-500">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalUsage({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; max: number; tone: string }[];
}) {
  return (
    <div className="glass rounded-xl2 p-5">
      <h2 className="text-sm font-semibold text-mist-100">{title}</h2>
      <div className="mt-4 space-y-4">
        {items.map((item) => {
          const pct = item.max > 0 ? Math.min(100, (item.value / item.max) * 100) : 0;
          return (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-mist-300">{item.label}</span>
                <span className="font-display tabular-nums text-mist-100">
                  {item.value.toLocaleString()}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-ink-950/60">
                <div
                  className={`h-full rounded-full ${item.tone} transition-all duration-700`}
                  style={{ width: `${Math.max(pct, item.value > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminPlatformView() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    api
      .adminUsers()
      .then(({ users: list }) => {
        if (!cancelled) setUsers(list);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accountOptions = useMemo(() => {
    if (!users) return [];
    return [...users]
      .sort((a, b) =>
        (a.ownerEmail ?? a.workspaceName).localeCompare(
          b.ownerEmail ?? b.workspaceName,
        ),
      )
      .map((u) => ({
        id: u.workspaceId,
        label: u.ownerEmail ?? u.ownerName ?? u.workspaceName,
      }));
  }, [users]);

  const data = useMemo(() => {
    if (!users) return null;
    const scoped =
      accountFilter === "all"
        ? users
        : users.filter((u) => u.workspaceId === accountFilter);
    return statsForUsers(scoped);
  }, [users, accountFilter]);

  const signups = useMemo(() => {
    if (!users) return [];
    const scoped =
      accountFilter === "all"
        ? users
        : users.filter((u) => u.workspaceId === accountFilter);
    return signupSeries(scoped, 14);
  }, [users, accountFilter]);

  const topByLeads = useMemo(() => {
    if (!users) return [];
    return [...users]
      .sort((a, b) => b.leadCount - a.leadCount)
      .slice(0, 6);
  }, [users]);

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

  const activityMax = Math.max(
    1,
    data.leadsUsedThisMonth,
    data.sendsUsedThisMonth,
    data.verifiesUsedToday,
    data.totalLeads,
  );

  const findOff = users?.filter((u) => !u.findLeadsEnabled).length ?? 0;
  const conversion =
    data.workspaceCount > 0
      ? Math.round((data.paidWorkspaceCount / data.workspaceCount) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-end gap-3">
        <div className="w-full max-w-xs">
          <Select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="w-full py-2 text-sm"
            aria-label="Filter by account"
          >
            <option value="all">All accounts</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Workspaces" value={data.workspaceCount} />
        <StatCard label="Auth users" value={data.userCount} />
        <StatCard
          label="Paid plans"
          value={data.paidWorkspaceCount}
          hint={`${conversion}% of workspaces · ${data.withStripeCustomer} Stripe`}
          accent="amber"
        />
        <StatCard
          label="Total leads"
          value={data.totalLeads.toLocaleString()}
          hint={`${data.totalSendsLifetime} sends · ${data.totalRuns} runs`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-xl2 p-5">
          <h2 className="text-sm font-semibold text-mist-100">Plan mix</h2>
          <div className="mt-4">
            <DonutPlan byPlan={data.byPlan} />
          </div>
        </div>
        <BarChart title="New workspaces (14 days)" series={signups} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <HorizontalUsage
          title="Activity pulse"
          items={[
            {
              label: "Leads used this month",
              value: data.leadsUsedThisMonth,
              max: activityMax,
              tone: "bg-aurora-400",
            },
            {
              label: "Sends used this month",
              value: data.sendsUsedThisMonth,
              max: activityMax,
              tone: "bg-aurora-400/70",
            },
            {
              label: "Verifies used today",
              value: data.verifiesUsedToday,
              max: activityMax,
              tone: "bg-amber-400",
            },
            {
              label: "Leads stored (all time)",
              value: data.totalLeads,
              max: activityMax,
              tone: "bg-mist-500",
            },
          ]}
        />

        <div className="glass rounded-xl2 p-5">
          <h2 className="text-sm font-semibold text-mist-100">Send readiness</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/8 bg-ink-950/40 p-4">
              <p className="text-[11px] uppercase tracking-wider text-mist-500">Easy key</p>
              <p className="mt-1 font-display text-2xl text-aurora-300">
                {data.withEasySendKey}
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-ink-950/40 p-4">
              <p className="text-[11px] uppercase tracking-wider text-mist-500">Mailbox</p>
              <p className="mt-1 font-display text-2xl text-amber-300">
                {data.withMailbox}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border border-white/8 bg-ink-950/40 p-4">
              <p className="text-[11px] uppercase tracking-wider text-mist-500">
                Find leads paused
              </p>
              <p className="mt-1 font-display text-2xl text-mist-100">{findOff}</p>
              <p className="mt-0.5 text-xs text-mist-500">
                Accounts with Search disabled by admin
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-xl2 p-5">
          <h2 className="text-sm font-semibold text-mist-100">Top workspaces by leads</h2>
          <ul className="mt-4 space-y-3">
            {topByLeads.length === 0 ? (
              <li className="text-sm text-mist-500">No data yet.</li>
            ) : (
              topByLeads.map((u) => {
                const maxL = topByLeads[0]?.leadCount || 1;
                return (
                  <li key={u.workspaceId}>
                    <div className="mb-1 flex justify-between gap-2 text-xs">
                      <span className="truncate text-mist-300">
                        {u.ownerEmail ?? u.workspaceName}
                      </span>
                      <span className="shrink-0 tabular-nums text-mist-100">
                        {u.leadCount}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-950/60">
                      <div
                        className="h-full rounded-full bg-aurora-400/80"
                        style={{
                          width: `${Math.max(4, (u.leadCount / maxL) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                );
              })
            )}
          </ul>
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
                      {getPlan(u.planId).name} · {u.leadCount} leads · {u.sentCount}{" "}
                      sent
                      {!u.findLeadsEnabled ? " · Search off" : ""}
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

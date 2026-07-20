"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import type { AdminPlatformStats, AdminUserRow, PlanId } from "@/lib/types";
import { getPlan } from "@/lib/plans";
import { Spinner } from "@/components/ui";
import { Select } from "@/components/ui/Select";

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

function statsForUsers(users: AdminUserRow[]): AdminPlatformStats {
  const byPlan: Record<PlanId, number> = {
    free: 0,
    starter: 0,
    pro: 0,
    agency: 0,
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
    if (u.planId !== "free") paidWorkspaceCount += 1;
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
      <div className="max-w-xs">
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

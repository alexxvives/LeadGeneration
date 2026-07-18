"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import type { AdminUserRow, PlanId } from "@/lib/types";
import { getPlan, PLAN_ORDER } from "@/lib/plans";
import { Spinner } from "@/components/ui";

export function AdminUsersView() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanId | "all">("all");

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

  const filtered = useMemo(() => {
    if (!users) return [];
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (planFilter !== "all" && u.planId !== planFilter) return false;
      if (!needle) return true;
      const hay = [
        u.ownerEmail,
        u.ownerName,
        u.workspaceName,
        u.workspaceId,
        u.stripeCustomerId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [users, q, planFilter]);

  if (err) {
    return (
      <div className="rounded-xl2 border border-rose-400/20 bg-rose-400/5 px-5 py-4 text-sm text-rose-200">
        {err}
      </div>
    );
  }

  if (!users) {
    return (
      <div className="flex items-center gap-2 text-mist-500">
        <Spinner className="h-4 w-4" /> Loading users…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-aurora-300">Admin</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-mist-100">Users</h1>
        <p className="mt-2 text-sm text-mist-400">
          {users.length} workspace{users.length === 1 ? "" : "s"} · plan, usage, and send setup
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email, workspace, Stripe…"
          className="min-w-[14rem] flex-1 rounded-lg border border-white/10 bg-ink-900/60 px-4 py-2.5 text-sm text-mist-100 outline-none focus:border-aurora-400/60"
        />
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanId | "all")}
          className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2.5 text-sm text-mist-100"
        >
          <option value="all">All plans</option>
          {PLAN_ORDER.map((id) => (
            <option key={id} value={id}>
              {getPlan(id).name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl2 border border-white/8">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-ink-900/80 text-[11px] uppercase tracking-wider text-mist-500">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Usage (mo)</th>
              <th className="px-4 py-3 font-medium">Verify today</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Send</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-mist-500">
                  No matching users.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.workspaceId} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-mist-100">
                      {u.ownerEmail ?? u.ownerName ?? "—"}
                    </p>
                    <p className="text-xs text-mist-500">{u.workspaceName}</p>
                    {u.stripeCustomerId ? (
                      <p className="mt-0.5 font-mono text-[10px] text-mist-500">
                        {u.stripeCustomerId}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        u.planId === "free"
                          ? "bg-white/5 text-mist-300 ring-white/10"
                          : "bg-aurora-400/15 text-aurora-300 ring-aurora-400/25"
                      }`}
                    >
                      {getPlan(u.planId).name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-mist-300">
                    <p>
                      {u.leadsUsedThisMonth}/{u.leadsLimit} leads
                    </p>
                    <p className="text-xs text-mist-500">
                      {u.sendsUsedThisMonth}/{u.sendsLimit} sends
                    </p>
                  </td>
                  <td className="px-4 py-3 text-mist-300">
                    {u.verifiesUsedToday}/{u.verifiesLimit}
                  </td>
                  <td className="px-4 py-3 text-mist-300">
                    <p>{u.leadCount} leads</p>
                    <p className="text-xs text-mist-500">
                      {u.sentCount} sent · {u.runCount} runs
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-mist-400">
                    {[
                      u.hasEasySendKey ? "Easy" : null,
                      u.hasMailbox ? "Mailbox" : null,
                      u.emailVerifyEnabled ? "Verify on" : "Verify off",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-mist-500 whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

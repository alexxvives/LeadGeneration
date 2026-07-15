"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { CrmStage, DashboardStats, WorkspaceSummary } from "@/lib/types";
import { Spinner } from "@/components/ui";
import Link from "next/link";

const STAGE_LABELS: Record<CrmStage, string> = {
  new: "New",
  contacted: "Contacted",
  in_conversation: "In conversation",
  closed: "Closed",
  not_interested: "Not interested",
  discarded: "Discarded",
};

const STAGE_COLORS: Record<CrmStage, string> = {
  new: "bg-mist-400",
  contacted: "bg-aurora-400",
  in_conversation: "bg-amber-400",
  closed: "bg-emerald-400",
  not_interested: "bg-rose-400/70",
  discarded: "bg-mist-600",
};

function BarChart({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-mist-300">{item.label}</span>
            <span className="font-display text-mist-100">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-950/60">
            <div
              className={`h-full rounded-full ${item.color} transition-all duration-700`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

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

export function DashboardView() {
  const [data, setData] = useState<(DashboardStats & { workspace: WorkspaceSummary }) | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .dashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6 text-aurora-300" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <p className="py-12 text-center text-sm text-rose-300">{err ?? "No data"}</p>
    );
  }

  const stageItems = (Object.keys(STAGE_LABELS) as CrmStage[]).map((k) => ({
    label: STAGE_LABELS[k],
    value: data.byCrmStage[k] ?? 0,
    color: STAGE_COLORS[k],
  }));

  return (
    <div className="animate-float-up space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-mist-400">
          Snapshot across all boards — pipeline health, sends, and recent runs.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total leads" value={data.totalLeads} />
        <StatCard label="Emails sent" value={data.sentCount} />
        <StatCard label="Drafts ready" value={data.draftedCount} />
        <StatCard
          label="Avg fit score"
          value={data.avgFitScore}
          hint="Across all leads"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-xl2 p-6">
          <h2 className="font-display text-lg font-semibold text-mist-100">
            Pipeline stages
          </h2>
          <p className="mt-1 text-xs text-mist-500">CRM stage across every board</p>
          <div className="mt-5">
            <BarChart items={stageItems} />
          </div>
        </div>

        <div className="glass rounded-xl2 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-mist-100">Boards</h2>
              <p className="mt-1 text-xs text-mist-500">Leads and closes per board</p>
            </div>
            <Link
              href="/app?view=boards"
              className="text-xs font-medium text-aurora-300 hover:underline"
            >
              Manage
            </Link>
          </div>
          <ul className="mt-5 space-y-3">
            {data.boards.map((b) => {
              const pct =
                b.leadCount > 0 ? Math.round((b.closedCount / b.leadCount) * 100) : 0;
              return (
                <li key={b.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium text-mist-100">
                      {b.name}
                      {b.isDefault ? (
                        <span className="ml-1.5 text-[10px] uppercase text-mist-500">
                          Default
                        </span>
                      ) : null}
                    </span>
                    <span className="text-mist-400">
                      {b.leadCount} · {b.sentCount} sent
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-950/60">
                    <div
                      className="h-full rounded-full bg-aurora-400/80"
                      style={{ width: `${Math.max(pct, b.leadCount ? 4 : 0)}%` }}
                      title={`${pct}% closed`}
                    />
                  </div>
                </li>
              );
            })}
            {data.boards.length === 0 ? (
              <li className="text-sm text-mist-500">No boards yet</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="glass rounded-xl2 p-6">
        <h2 className="font-display text-lg font-semibold text-mist-100">Recent runs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-mist-500">
                <th className="pb-2 font-medium">Niche</th>
                <th className="pb-2 font-medium">Leads</th>
                <th className="pb-2 font-medium">Mode</th>
                <th className="pb-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRuns.map((r) => (
                <tr key={r.id} className="border-b border-white/5 text-mist-200">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-mist-100">{r.niche}</span>
                    {r.location ? (
                      <span className="mt-0.5 block text-xs text-mist-500">
                        {r.location}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5">{r.leadCount}</td>
                  <td className="py-2.5 capitalize text-mist-400">{r.mode}</td>
                  <td className="py-2.5 text-mist-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {data.recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-mist-500">
                    No searches yet —{" "}
                    <Link href="/app" className="text-aurora-300 hover:underline">
                      find leads
                    </Link>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

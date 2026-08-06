"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { Run } from "@/lib/types";
import { DeferredSkeleton, RunsSkeleton } from "./skeletons";

/** Search history — click a row to open that run’s leads on the Leads view. */
export function RunsView({
  activeRunId,
  onOpenRun,
}: {
  activeRunId: string | null;
  onOpenRun?: (runId: string) => void;
}) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRuns()
      .then((r) => setRuns(r.runs))
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) {
    return (
      <div className="rounded-xl2 border border-rose-400/20 bg-rose-400/5 px-5 py-4 text-sm text-rose-200">
        {err}
        <button
          type="button"
          className="ml-3 text-aurora-300 underline-offset-2 hover:underline"
          onClick={() => {
            setErr(null);
            setRuns(null);
            void api
              .listRuns()
              .then((r) => setRuns(r.runs))
              .catch((e) => setErr((e as Error).message));
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <DeferredSkeleton loading={!runs} skeleton={<RunsSkeleton />}>
      {!runs || runs.length === 0 ? (
        <div className="glass rounded-xl2 p-10 text-center text-mist-300">
          No searches yet. Run one from Search.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-white/10">
          <p className="border-b border-white/5 px-5 py-2 text-xs text-mist-500">
            Click a run to open its leads on Leads.
          </p>
          {runs.map((r, i) => {
            const isActive = r.id === activeRunId;
            const clickable = Boolean(onOpenRun);
            return (
              <div
                key={r.id}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={
                  clickable
                    ? () => onOpenRun?.(r.id)
                    : undefined
                }
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenRun?.(r.id);
                        }
                      }
                    : undefined
                }
                className={`grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] sm:gap-4 ${
                  i > 0 ? "border-t border-white/5" : ""
                } ${isActive ? "bg-aurora-400/5" : ""} ${
                  clickable
                    ? "cursor-pointer transition-colors hover:bg-white/[0.03]"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {r.niche}
                    {r.location ? (
                      <span className="text-mist-500"> · {r.location}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-mist-500">
                    {new Date(r.createdAt).toLocaleString()} · {r.provider} · {r.mode}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-mist-300 sm:text-right">
                  {r.leadCount} leads
                </span>
                <span
                  className={`text-xs font-medium uppercase tracking-wider sm:text-center ${
                    r.status === "complete"
                      ? "text-aurora-300"
                      : r.status === "failed"
                        ? "text-rose-300"
                        : "text-amber-300"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </DeferredSkeleton>
  );
}

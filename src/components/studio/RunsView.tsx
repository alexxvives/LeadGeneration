"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { Run } from "@/lib/types";
import { Spinner } from "@/components/ui";

/** Search history — informative only (board filter lives in Pipeline / Leads). */
export function RunsView({ activeRunId }: { activeRunId: string | null }) {
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
      </div>
    );
  }
  if (!runs) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Spinner className="h-7 w-7 text-aurora-400" />
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <div className="glass rounded-xl2 p-10 text-center text-mist-300">
        No searches yet. Run one from Search.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl2 border border-white/10">
      {runs.map((r, i) => {
        const isActive = r.id === activeRunId;
        return (
          <div
            key={r.id}
            className={`grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] sm:gap-4 ${
              i > 0 ? "border-t border-white/5" : ""
            } ${isActive ? "bg-aurora-400/5" : ""}`}
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
  );
}

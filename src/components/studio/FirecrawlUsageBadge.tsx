"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type FirecrawlUsage } from "@/lib/client-api";

/**
 * Shows Firecrawl remaining credits (and optional delta after a search).
 * Credits ≠ AI tokens — Firecrawl bills search/scrape in credits.
 */
export function FirecrawlUsageBadge({
  refreshKey = 0,
  before,
}: {
  /** Bump after a search to re-fetch. */
  refreshKey?: number;
  /** Snapshot taken before the last search (for delta). */
  before?: FirecrawlUsage | null;
}) {
  const [usage, setUsage] = useState<FirecrawlUsage | null>(null);

  const load = useCallback(async () => {
    try {
      const u = await api.firecrawlUsage();
      setUsage(u);
    } catch {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!usage?.available || usage.remainingCredits == null) return null;

  const remaining = usage.remainingCredits;
  const usedThisRun =
    before?.available && before.remainingCredits != null
      ? Math.max(0, before.remainingCredits - remaining)
      : null;

  // remaining can exceed plan_credits (rollover / top-ups). Never show
  // "34414 / 1000 left" — that reads as a broken fraction.
  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-full px-3 py-1.5 text-xs text-mist-300">
      <span className="font-medium text-aurora-300">Firecrawl</span>
      {usedThisRun != null && usedThisRun > 0 && (
        <>
          <span className="text-mist-500">·</span>
          <span className="tabular-nums text-amber-200/90">−{usedThisRun} this run</span>
        </>
      )}
      <span className="text-mist-500">·</span>
      <span className="tabular-nums">{remaining.toLocaleString()} credits left</span>
    </div>
  );
}

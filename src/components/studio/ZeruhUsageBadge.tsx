"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ZeruhUsage } from "@/lib/client-api";

/**
 * Shows Zeruh (email verify) remaining credits.
 * 1 credit = 1 verification at send time.
 */
export function ZeruhUsageBadge({
  refreshKey = 0,
  before,
}: {
  /** Bump after a send to re-fetch. */
  refreshKey?: number;
  /** Snapshot taken before the last send (for delta). */
  before?: ZeruhUsage | null;
}) {
  const [usage, setUsage] = useState<ZeruhUsage | null>(null);

  const load = useCallback(async () => {
    try {
      const u = await api.zeruhUsage();
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
  const usedThisSend =
    before?.available && before.remainingCredits != null
      ? Math.max(0, before.remainingCredits - remaining)
      : null;

  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-full px-3 py-1.5 text-xs text-mist-300">
      <span className="font-medium text-amber-300">Zeruh</span>
      {usedThisSend != null && usedThisSend > 0 && (
        <>
          <span className="text-mist-500">·</span>
          <span className="tabular-nums text-amber-200/90">−{usedThisSend} this send</span>
        </>
      )}
      <span className="text-mist-500">·</span>
      <span className="tabular-nums">{remaining.toLocaleString()} credits left</span>
    </div>
  );
}

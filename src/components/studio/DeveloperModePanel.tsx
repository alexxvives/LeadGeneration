"use client";

import { useState } from "react";
import Link from "next/link";
import { StarIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client-api";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import type { PlanId } from "@/lib/types";

/**
 * TEMP developer tools — tour replay, credit reset, plan override.
 * Remove this section before GA.
 */
export function DeveloperModePanel({
  metered = true,
  currentPlanId = "free",
}: {
  metered?: boolean;
  currentPlanId?: PlanId;
}) {
  const [resetting, setResetting] = useState(false);
  const [settingPlan, setSettingPlan] = useState(false);
  const [planId, setPlanId] = useState<PlanId>(currentPlanId);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const resetCredits = async () => {
    setResetting(true);
    setMsg(null);
    setErr(null);
    try {
      await api.resetUsage();
      setMsg("Credits reset to 0 used. Refresh the page to see updated bars.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const applyPlan = async () => {
    setSettingPlan(true);
    setMsg(null);
    setErr(null);
    try {
      await api.setPlanDev(planId);
      setMsg(
        `Plan set to ${PLANS[planId].name}. Refresh the page to see updated quotas.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Plan change failed");
    } finally {
      setSettingPlan(false);
    }
  };

  return (
    <div className="rounded-xl2 border border-dashed border-amber-400/25 bg-amber-400/[0.03] p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-200/70">
        Developer mode · temporary
      </p>
      <p className="mt-1 text-sm text-mist-500">
        Tools for testing. Will be removed before launch.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href="/app?setup=1"
          className="inline-flex items-center gap-2 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-4 py-2 text-sm font-medium text-aurora-200 transition-colors hover:bg-aurora-400/15"
        >
          <StarIcon className="h-4 w-4" />
          Replay product tour
        </Link>
        <button
          type="button"
          onClick={() => void resetCredits()}
          disabled={resetting}
          title="Zero lead and send usage counters"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-mist-200 transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          {resetting ? <Spinner className="h-3.5 w-3.5" /> : null}
          Reset credits
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/5 pt-4">
        <label className="flex min-w-[10rem] flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-mist-500">
            Override plan
          </span>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value as PlanId)}
            className="rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-mist-100 outline-none focus:border-aurora-400/40"
          >
            {PLAN_ORDER.map((id) => (
              <option key={id} value={id}>
                {PLANS[id].name}
                {id === currentPlanId ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void applyPlan()}
          disabled={settingPlan || planId === currentPlanId}
          className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-400/15 disabled:opacity-40"
        >
          {settingPlan ? <Spinner className="h-3.5 w-3.5" /> : null}
          Apply plan
        </button>
      </div>

      {msg && <p className="mt-3 text-sm text-aurora-300">{msg}</p>}
      {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
      {!metered && (
        <p className="mt-3 text-xs text-mist-500">
          Local preview tracks usage for the bars; hard plan caps apply on the live app.
        </p>
      )}
    </div>
  );
}

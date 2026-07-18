"use client";

import { getPlan } from "@/lib/plans";
import type { PlanId } from "@/lib/types";
import { SparkIcon, XIcon } from "@/components/icons";

/**
 * Shown when the workspace hits its daily email-verify quota.
 * Unlike UpgradeModal — verifies reset tomorrow; upgrading may raise the cap.
 */
export function VerifyLimitModal({
  planId,
  onClose,
}: {
  planId: PlanId;
  onClose: () => void;
}) {
  const plan = getPlan(planId);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-6">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="glass animate-float-up relative w-full max-w-md rounded-xl2 p-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100"
          aria-label="Close"
        >
          <XIcon className="h-5 w-5" />
        </button>

        <div className="grid h-11 w-11 place-items-center rounded-full bg-amber-400/15 text-amber-300">
          <SparkIcon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold">
          Daily verifications used up
        </h2>
        <p className="mt-2 text-sm text-mist-300">
          Your {plan.name} plan includes{" "}
          <span className="font-medium text-mist-100">{plan.verifiesPerDay}</span>{" "}
          email checks per day. You&apos;ve hit that limit — no more verifications
          until tomorrow (resets at midnight UTC).
        </p>
        <p className="mt-3 text-sm text-mist-500">
          You can still send with verify turned off in Settings, or wait for the
          daily reset
          {planId !== "agency" ? " — higher plans get more daily checks" : ""}.
        </p>

        <div className="mt-6">
          <button
            onClick={onClose}
            className="rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-105"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

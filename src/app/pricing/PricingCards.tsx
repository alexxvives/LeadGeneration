"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLAN_ORDER, PLANS, annualMonthlyPrice } from "@/lib/plans";
import { api } from "@/lib/client-api";
import type { PlanId } from "@/lib/types";
import { CheckIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";

export function PricingCards() {
  const router = useRouter();
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const onSelect = async (planId: PlanId) => {
    setNote(null);
    if (planId === "free") {
      router.push("/app");
      return;
    }
    setBusy(planId);
    try {
      const { url } = await api.checkout(planId);
      if (url) {
        window.location.href = url;
        return;
      }
      setNote("Couldn't start checkout. Please try again.");
    } catch {
      // Most commonly: not signed in, or billing not enabled in this env.
      setNote("Sign in to upgrade — redirecting…");
      router.push(`/login?callbackUrl=${encodeURIComponent("/pricing")}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-10">
      {/* Billing period toggle */}
      <div className="mb-8 flex items-center justify-center gap-3">
        <span className={annual ? "text-mist-500" : "text-mist-100"}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual((a) => !a)}
          className={`relative h-7 w-12 rounded-full border border-white/10 transition-colors ${
            annual ? "bg-aurora-400" : "bg-ink-800"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink-950 transition-transform ${
              annual ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className={annual ? "text-mist-100" : "text-mist-500"}>
          Annual <span className="text-aurora-300">(save ~20%)</span>
        </span>
      </div>

      <div className="grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const price =
            plan.monthlyPrice === 0
              ? 0
              : annual
                ? annualMonthlyPrice(plan)
                : plan.monthlyPrice;
          const highlighted = id === "pro";
          return (
            <div
              key={id}
              className={`glass card-hover flex flex-col rounded-xl2 p-6 ${
                highlighted ? "ring-1 ring-aurora-400/40" : ""
              }`}
            >
              {highlighted && (
                <span className="mb-3 inline-flex w-fit rounded-full bg-aurora-400/15 px-2.5 py-0.5 text-xs font-medium text-aurora-300">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-4xl font-semibold tabular-nums">
                  ${price}
                </span>
                <span className="text-sm text-mist-500">/mo</span>
              </div>
              {annual && plan.monthlyPrice > 0 && (
                <p className="mt-1 text-xs text-mist-500">billed annually</p>
              )}

              <button
                onClick={() => onSelect(id)}
                disabled={busy === id}
                className={`mt-5 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-transform hover:scale-[1.02] disabled:opacity-50 ${
                  id === "free"
                    ? "border border-white/15 text-mist-100 hover:bg-white/5"
                    : "bg-aurora-400 text-ink-950"
                }`}
              >
                {busy === id ? (
                  <Spinner className="h-4 w-4" />
                ) : id === "free" ? (
                  "Get started free"
                ) : (
                  `Upgrade to ${plan.name}`
                )}
              </button>

              <ul className="mt-6 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-mist-300">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-aurora-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {note && <p className="mt-6 text-center text-sm text-amber-300">{note}</p>}
    </div>
  );
}

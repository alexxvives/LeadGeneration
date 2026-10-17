"use client";

import { useMemo, useState } from "react";
import type { LeadWithOutreach } from "@/lib/types";
import {
  BUY_DEVICE,
  CHOOSE_TRIAL,
  PATH_A,
  PATH_A_CLOSE,
  PATH_A_INTERESTED,
  PATH_A_NOT_INTERESTED,
  PATH_B,
  SEND_PRICES,
  onboardingCursor,
  onboardingDonePatch,
  parseOnboardingDone,
  type OnboardingStep,
} from "@/lib/onboarding-path";

export function OnboardingBoard({
  leads,
  onOpen,
  onSetDone,
}: {
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onSetDone: (leadId: string, customFields: Record<string, string>) => void;
}) {
  const rows = useMemo(() => {
    return leads
      .filter(
        (l) =>
          l.conversationStep === "onboarding" ||
          l.conversationStep === "reviewing_contract",
      )
      .slice()
      .sort((a, b) =>
        a.company.localeCompare(b.company, undefined, { sensitivity: "base" }),
      );
  }, [leads]);

  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    rows.find((l) => l.id === picked) ?? rows[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <ul
        className="flex max-h-48 shrink-0 flex-col gap-1 overflow-y-auto lg:max-h-none lg:w-72"
        aria-label="Leads in onboarding"
      >
        {rows.length === 0 ? (
          <li className="rounded-xl border border-white/10 px-3 py-6 text-center text-xs text-mist-500">
            Nobody in Onboarding or Reviewing contract yet.
          </li>
        ) : (
          rows.map((lead) => {
            const on = selected?.id === lead.id;
            const cursor = onboardingCursor(parseOnboardingDone(lead.customFields));
            return (
              <li key={lead.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(lead.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                    on
                      ? "border-aurora-400/50 bg-aurora-400/10"
                      : "border-white/10 bg-ink-900/50 hover:border-white/20"
                  }`}
                >
                  <span className="text-sm font-medium text-mist-100">
                    {lead.company}
                  </span>
                  <span className="text-[11px] text-mist-400">
                    {lead.conversationStep === "reviewing_contract"
                      ? "Reviewing contract"
                      : "Onboarding"}
                    {" · "}
                    {cursor}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl2 border border-white/10 bg-ink-950/40 p-4">
        {selected ? (
          <Tree
            lead={selected}
            onOpen={() => onOpen(selected.id)}
            onToggle={(id, checked) => {
              const done = new Set(parseOnboardingDone(selected.customFields));
              if (checked) done.add(id);
              else done.delete(id);
              onSetDone(
                selected.id,
                onboardingDonePatch(selected.customFields, [...done]),
              );
            }}
          />
        ) : (
          <p className="py-8 text-center text-sm text-mist-500">
            Move a lead to Onboarding or Reviewing contract to track the path here.
          </p>
        )}
      </div>
    </div>
  );
}

function Tree({
  lead,
  onOpen,
  onToggle,
}: {
  lead: LeadWithOutreach;
  onOpen: () => void;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const done = new Set(parseOnboardingDone(lead.customFields));
  const trial = done.has(CHOOSE_TRIAL.id);
  const buying =
    done.has(BUY_DEVICE.id) || done.has(PATH_A_INTERESTED.id);
  const closing = done.has(PATH_A_NOT_INTERESTED.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl text-mist-100">{lead.company}</h2>
        <button
          type="button"
          onClick={onOpen}
          className="text-xs text-aurora-300 underline-offset-2 hover:underline"
        >
          Open lead
        </button>
      </div>

      <Check
        step={SEND_PRICES}
        done={done.has(SEND_PRICES.id)}
        onToggle={onToggle}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300">
            Path A · Trial
          </p>
          <Check
            step={CHOOSE_TRIAL}
            done={trial}
            onToggle={onToggle}
          />
          <Chain
            steps={PATH_A}
            done={done}
            dim={!trial}
            onToggle={onToggle}
          />
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 p-2">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-mist-500">
                A1
              </p>
              <Check
                step={PATH_A_NOT_INTERESTED}
                done={closing}
                onToggle={onToggle}
              />
              <Chain
                steps={PATH_A_CLOSE}
                done={done}
                dim={!closing}
                onToggle={onToggle}
              />
              {closing && PATH_A_CLOSE.every((s) => done.has(s.id)) ? (
                <p className="mt-2 text-xs font-medium text-mist-300">Fin</p>
              ) : null}
            </div>
            <div className="rounded-lg border border-white/10 p-2">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-mist-500">
                A2
              </p>
              <Check
                step={PATH_A_INTERESTED}
                done={done.has(PATH_A_INTERESTED.id)}
                onToggle={onToggle}
              />
              <p className="mt-1 text-[11px] leading-snug text-mist-500">
                Continues on Path B.
              </p>
            </div>
          </div>
        </section>

        <section
          className={`flex flex-col gap-2 rounded-xl border p-3 ${
            buying
              ? "border-aurora-400/40 bg-aurora-400/5"
              : "border-white/10 bg-ink-900/40"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-aurora-300">
            Path B · Compra
          </p>
          <Check step={BUY_DEVICE} done={done.has(BUY_DEVICE.id)} onToggle={onToggle} />
          <Chain steps={PATH_B} done={done} dim={!buying} onToggle={onToggle} />
          {buying && PATH_B.every((s) => done.has(s.id)) ? (
            <p className="text-xs font-medium text-aurora-200">Listo</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Chain({
  steps,
  done,
  dim,
  onToggle,
}: {
  steps: readonly OnboardingStep[];
  done: Set<string>;
  dim: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <ol className={`flex flex-col gap-1.5 ${dim ? "opacity-45" : ""}`}>
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-start gap-2">
          <span className="mt-1.5 w-4 shrink-0 text-center text-[10px] tabular-nums text-mist-500">
            {i + 1}
          </span>
          <Check step={step} done={done.has(step.id)} onToggle={onToggle} />
        </li>
      ))}
    </ol>
  );
}

function Check({
  step,
  done,
  onToggle,
}: {
  step: OnboardingStep;
  done: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-mist-100">
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => onToggle(step.id, e.target.checked)}
        className="h-4 w-4 accent-aurora-400"
      />
      <span className={done ? "text-mist-400 line-through" : ""}>{step.label}</span>
    </label>
  );
}

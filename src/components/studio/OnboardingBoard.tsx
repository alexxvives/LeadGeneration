"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  loading,
  onOpen,
  onSetDone,
}: {
  leads: LeadWithOutreach[];
  loading?: boolean;
  onOpen: (id: string) => void;
  onSetDone: (leadId: string, customFields: Record<string, string>) => void;
}) {
  const rows = useMemo(
    () =>
      leads
        .slice()
        .sort((a, b) =>
          a.company.localeCompare(b.company, undefined, { sensitivity: "base" }),
        ),
    [leads],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const selected = rows.find((l) => l.id === picked) ?? rows[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <ul
        className="flex max-h-40 shrink-0 flex-col gap-1 overflow-y-auto lg:max-h-none lg:w-64"
        aria-label="Leads in onboarding"
      >
        {loading && rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-mist-500">Loading…</li>
        ) : rows.length === 0 ? (
          <li className="rounded-xl border border-white/10 px-3 py-6 text-center text-xs text-mist-500">
            Nobody in Onboarding or Reviewing contract yet.
          </li>
        ) : (
          rows.map((lead) => {
            const on = selected?.id === lead.id;
            return (
              <li key={lead.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(lead.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left ${
                    on
                      ? "border-aurora-400/50 bg-aurora-400/10"
                      : "border-white/10 bg-ink-900/50 hover:border-white/20"
                  }`}
                >
                  <span className="text-sm font-medium text-mist-100">{lead.company}</span>
                  <span className="text-[11px] text-mist-400">
                    {onboardingCursor(parseOnboardingDone(lead.customFields))}
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
              onSetDone(selected.id, onboardingDonePatch(selected.customFields, [...done]));
            }}
          />
        ) : (
          <p className="py-8 text-center text-sm text-mist-500">
            {loading
              ? "Loading contract and onboarding leads…"
              : "Move a lead to Onboarding or Reviewing contract to track the path here."}
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
  const buying = done.has(BUY_DEVICE.id) || done.has(PATH_A_INTERESTED.id);
  const closing = done.has(PATH_A_NOT_INTERESTED.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-0">
      <div className="mb-2 flex w-full items-baseline justify-between gap-2">
        <h2 className="font-display text-xl text-mist-100">{lead.company}</h2>
        <button
          type="button"
          onClick={onOpen}
          className="text-xs text-aurora-300 underline-offset-2 hover:underline"
        >
          Open lead
        </button>
      </div>

      <StepNode step={SEND_PRICES} on={done.has(SEND_PRICES.id)} onToggle={onToggle} />
      <Stem />
      <Fork />

      <div className="grid w-full gap-4 md:grid-cols-2">
        <Branch
          title="Path A"
          subtitle="Trial"
          tone="amber"
          selected={trial}
          onSelect={() => onToggle(CHOOSE_TRIAL.id, !trial)}
        >
          <Chain steps={PATH_A} done={done} onToggle={onToggle} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Branch
              title="A1"
              subtitle="No le interesa"
              tone="mist"
              selected={closing}
              onSelect={() => onToggle(PATH_A_NOT_INTERESTED.id, !closing)}
            >
              <Chain steps={PATH_A_CLOSE} done={done} onToggle={onToggle} />
              {closing && PATH_A_CLOSE.every((s) => done.has(s.id)) ? (
                <p className="text-center text-xs font-semibold text-mist-300">Fin</p>
              ) : null}
            </Branch>
            <Branch
              title="A2"
              subtitle="Les interesa"
              tone="aurora"
              selected={done.has(PATH_A_INTERESTED.id)}
              onSelect={() =>
                onToggle(PATH_A_INTERESTED.id, !done.has(PATH_A_INTERESTED.id))
              }
            >
              <p className="text-center text-[11px] text-mist-400">Continues on Path B.</p>
            </Branch>
          </div>
        </Branch>

        <Branch
          title="Path B"
          subtitle="Compra"
          tone="aurora"
          selected={buying}
          onSelect={() => onToggle(BUY_DEVICE.id, !done.has(BUY_DEVICE.id))}
        >
          <Chain steps={PATH_B} done={done} onToggle={onToggle} />
          {PATH_B.every((s) => done.has(s.id)) ? (
            <p className="text-center text-xs font-semibold text-aurora-200">Listo</p>
          ) : null}
        </Branch>
      </div>
    </div>
  );
}

function Branch({
  title,
  subtitle,
  tone,
  selected,
  onSelect,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "amber" | "aurora" | "mist";
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const ring =
    tone === "amber"
      ? "border-amber-400/50 bg-amber-400/10"
      : tone === "aurora"
        ? "border-aurora-400/50 bg-aurora-400/10"
        : "border-white/20 bg-white/5";
  return (
    <section className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
          selected ? ring : "border-white/10 bg-ink-900/40 opacity-70 hover:opacity-100"
        }`}
      >
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-mist-400">
          {selected ? "Selected" : "Select branch"}
        </span>
        <span className="font-display text-lg text-mist-100">{title}</span>
        <span className="mt-0.5 block text-sm text-mist-300">{subtitle}</span>
      </button>
      {selected ? (
        <div className="flex flex-col items-center gap-0 px-1">{children}</div>
      ) : null}
    </section>
  );
}

function Chain({
  steps,
  done,
  onToggle,
}: {
  steps: readonly OnboardingStep[];
  done: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      {steps.map((step) => (
        <div key={step.id} className="flex w-full flex-col items-center">
          <Stem />
          <StepNode step={step} on={done.has(step.id)} onToggle={onToggle} />
        </div>
      ))}
    </div>
  );
}

function StepNode({
  step,
  on,
  onToggle,
}: {
  step: OnboardingStep;
  on: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(step.id, !on)}
      className={`w-full max-w-xs rounded-full border px-4 py-2 text-sm transition-colors ${
        on
          ? "border-aurora-400 bg-aurora-400 text-on-accent"
          : "border-white/15 bg-ink-900 text-mist-100 hover:border-aurora-400/40"
      }`}
    >
      {on ? "✓ " : ""}
      {step.label}
    </button>
  );
}

function Stem() {
  return <span aria-hidden className="h-4 w-px bg-white/25" />;
}

function Fork() {
  return (
    <div aria-hidden className="mb-2 h-4 w-[70%] border-x border-t border-white/25" />
  );
}

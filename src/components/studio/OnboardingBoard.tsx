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
        className="flex max-h-36 shrink-0 gap-2 overflow-x-auto lg:max-h-none lg:w-56 lg:flex-col lg:overflow-y-auto"
        aria-label="Leads in onboarding"
      >
        {loading && rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-mist-500">Loading…</li>
        ) : rows.length === 0 ? (
          <li className="rounded-2xl border border-white/10 px-3 py-6 text-center text-xs text-mist-500">
            Nobody in Onboarding or Reviewing contract yet.
          </li>
        ) : (
          rows.map((lead) => {
            const on = selected?.id === lead.id;
            return (
              <li key={lead.id} className="min-w-[11rem] lg:min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(lead.id)}
                  className={`flex w-full flex-col items-start gap-1 rounded-2xl border px-3 py-2.5 text-left shadow-sm ${
                    on
                      ? "border-aurora-400/60 bg-aurora-400/15"
                      : "border-white/10 bg-ink-900/70 hover:border-white/25"
                  }`}
                >
                  <span className="text-sm font-medium text-mist-100">{lead.company}</span>
                  <span className="text-[11px] leading-snug text-mist-400">
                    {onboardingCursor(parseOnboardingDone(lead.customFields))}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_top,rgba(45,212,191,0.08),transparent_55%)] p-4 sm:p-6">
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
          <p className="py-10 text-center text-sm text-mist-500">
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
  const buyDirect = done.has(BUY_DEVICE.id);
  const interested = done.has(PATH_A_INTERESTED.id);
  const buying = buyDirect || interested;
  const closing = done.has(PATH_A_NOT_INTERESTED.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
      <div className="mb-4 flex w-full items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-mist-500">Onboarding</p>
          <h2 className="font-display text-2xl text-mist-100">{lead.company}</h2>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-aurora-200 hover:border-aurora-400/40"
        >
          Open lead
        </button>
      </div>

      <Tile step={SEND_PRICES} on={done.has(SEND_PRICES.id)} onToggle={onToggle} />
      <WaveFork />

      <div className="grid w-full items-start gap-6 md:grid-cols-2">
        <Column
          live={trial}
          head={
            <Tile
              step={CHOOSE_TRIAL}
              on={trial}
              tone="amber"
              onToggle={onToggle}
            />
          }
        >
          {PATH_A.map((step) => (
            <Tile
              key={step.id}
              step={step}
              on={done.has(step.id)}
              tone="amber"
              dim={!trial}
              onToggle={onToggle}
            />
          ))}
          <WaveFork compact />
          <div className="grid w-full grid-cols-2 gap-3">
            <Column
              live={closing}
              head={
                <Tile
                  step={PATH_A_NOT_INTERESTED}
                  on={closing}
                  tone="mist"
                  dim={!trial}
                  onToggle={onToggle}
                />
              }
            >
              {PATH_A_CLOSE.map((step) => (
                <Tile
                  key={step.id}
                  step={step}
                  on={done.has(step.id)}
                  tone="mist"
                  dim={!closing}
                  onToggle={onToggle}
                />
              ))}
              <EndTile label="Fin" on={closing && PATH_A_CLOSE.every((s) => done.has(s.id))} />
            </Column>
            <Column
              live={interested}
              head={
                <Tile
                  step={PATH_A_INTERESTED}
                  on={interested}
                  tone="aurora"
                  dim={!trial}
                  onToggle={onToggle}
                />
              }
            >
              <p className="px-1 text-center text-[11px] leading-snug text-mist-400">
                Follows the compra tiles.
              </p>
            </Column>
          </div>
        </Column>

        <Column
          live={buying}
          head={
            <Tile
              step={BUY_DEVICE}
              on={buyDirect}
              tone="aurora"
              hint={interested && !buyDirect ? "From trial" : undefined}
              onToggle={onToggle}
            />
          }
        >
          {PATH_B.map((step) => (
            <Tile
              key={step.id}
              step={step}
              on={done.has(step.id)}
              tone="aurora"
              dim={!buying}
              onToggle={onToggle}
            />
          ))}
          <EndTile label="Listo" on={buying && PATH_B.every((s) => done.has(s.id))} />
        </Column>
      </div>
    </div>
  );
}

function Column({
  live,
  head,
  children,
}: {
  live: boolean;
  head: ReactNode;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className={`flex flex-col items-center ${live ? "" : "opacity-80"}`}>
      {head}
      {items.map((child, i) => {
        const skipWave = isFork(child) || (i > 0 && isFork(items[i - 1]));
        return (
          <div key={i} className="flex w-full flex-col items-center">
            {skipWave ? child : (
              <>
                <WaveDown hot={live} />
                {child}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function isFork(node: ReactNode): boolean {
  return !!node && typeof node === "object" && "type" in node && node.type === WaveFork;
}

function Tile({
  step,
  on,
  onToggle,
  tone = "aurora",
  dim = false,
  hint,
}: {
  step: OnboardingStep;
  on: boolean;
  onToggle: (id: string, checked: boolean) => void;
  tone?: "aurora" | "amber" | "mist";
  dim?: boolean;
  hint?: string;
}) {
  const face = on
    ? tone === "amber"
      ? "border-amber-300 bg-amber-400 text-on-accent shadow-[0_8px_24px_-12px_rgba(251,191,36,0.9)]"
      : tone === "mist"
        ? "border-mist-300 bg-mist-200 text-ink-950"
        : "border-aurora-300 bg-aurora-400 text-on-accent shadow-[0_8px_24px_-12px_rgba(45,212,191,0.9)]"
    : "border-white/15 bg-ink-900/90 text-mist-100 hover:border-white/30";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(step.id, !on)}
      className={`relative w-full max-w-[15rem] rounded-2xl border px-3 py-3 text-left transition-transform hover:-translate-y-0.5 ${face} ${
        dim && !on ? "opacity-55" : ""
      }`}
    >
      <span
        className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
          on ? "bg-ink-950/20" : "border border-current/30"
        }`}
        aria-hidden
      >
        {on ? "✓" : ""}
      </span>
      <span className="block font-display text-[15px] leading-tight">{step.label}</span>
      {hint ? <span className="mt-1 block text-[10px] uppercase tracking-wider opacity-80">{hint}</span> : null}
    </button>
  );
}

function EndTile({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className={`rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide ${
        on ? "bg-aurora-400/20 text-aurora-100 ring-1 ring-aurora-400/40" : "text-mist-500"
      }`}
    >
      {label}
    </div>
  );
}

function WaveDown({ hot }: { hot: boolean }) {
  return (
    <svg width="28" height="36" viewBox="0 0 28 36" aria-hidden className="shrink-0">
      <path
        d="M14 1 C 22 8, 6 14, 14 20 C 22 26, 6 30, 14 35"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className={hot ? "text-aurora-300" : "text-mist-500/50"}
      />
    </svg>
  );
}

function WaveFork({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 320 56"
      aria-hidden
      className={`shrink-0 text-mist-400/80 ${compact ? "h-10 w-full max-w-sm" : "h-14 w-full max-w-xl"}`}
    >
      <path
        d="M160 2 C 160 22, 70 18, 48 54"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M160 2 C 160 22, 250 18, 272 54"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

"use client";

import { useEffect, type ReactNode } from "react";
import type { LeadWithOutreach } from "@/lib/types";
import { XIcon } from "@/components/icons";
import type { OnboardingStep } from "@/lib/onboarding-path";
import {
  BRANCH_NUEVO,
  BRANCH_USADO,
  COMMON,
  NO_TRIAL,
  LANE_COMPL,
  LANE_CUSTOM,
  NT,
  NT_PRODUCTS,
  PLAN_FIJO,
  PLAN_VARIABLE,
  noTrialActiveSteps,
  NUEVO,
  TRIAL,
  USADO,
  toggleTreeStep,
  type TrialBranch,
} from "@/lib/lead-tree";

type Tone = "task" | "decision" | "reject";

export function OnboardingTreeDialog({
  lead,
  onClose,
  onSetDone,
}: {
  lead: LeadWithOutreach;
  onClose: () => void;
  onSetDone: (leadTree: string[]) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close onboarding"
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tree-title"
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-3xl"
      >
        <div className="relative shrink-0 border-b border-white/10 px-6 py-4">
          <p className="text-center text-[11px] uppercase tracking-[0.22em] text-mist-500">
            Onboarding
          </p>
          <h2
            id="onboarding-tree-title"
            className="text-center font-display text-2xl text-mist-100"
          >
            {lead.company}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-2 text-mist-500 hover:bg-white/5 hover:text-mist-100"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <LeadTree lead={lead} onSetDone={onSetDone} />
      </div>
    </div>
  );
}

function LeadTree({
  lead,
  onSetDone,
}: {
  lead: LeadWithOutreach;
  onSetDone: (leadTree: string[]) => void;
}) {
  // Tree progress has its own column (lead.leadTree), so ticking steps never
  // overwrites a teammate's custom-field edit. Every lead starts from zero:
  // legacy custom-field progress is never read.
  const current = lead.leadTree ?? [];
  const done = new Set(current);
  const toggle = (id: string, checked: boolean) => {
    onSetDone(toggleTreeStep(current, id, checked));
  };
  const trial = done.has(TRIAL.id);
  const noTrial = done.has(NO_TRIAL.id);
  const branch = done.has(NUEVO.id)
    ? BRANCH_NUEVO
    : done.has(USADO.id)
      ? BRANCH_USADO
      : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
        <Column live>
          {COMMON.map((step) => (
            <Tile
              key={step.id}
              step={step}
              on={done.has(step.id)}
              tone="task"
              onToggle={toggle}
            />
          ))}
        </Column>
        <WaveFork />
        <Choice a={TRIAL} b={NO_TRIAL} done={done} onToggle={toggle} />
        {noTrial ? <NoTrialPath done={done} onToggle={toggle} /> : null}
        {trial ? (
          <>
            <WaveFork compact />
            <Choice a={NUEVO} b={USADO} done={done} onToggle={toggle} />
            {branch ? (
              <TrialPath branch={branch} done={done} onToggle={toggle} />
            ) : null}
          </>
        ) : null}
        {!trial && !noTrial ? (
          <p className="mt-3 text-center text-xs text-mist-500">
            Elige TRIAL o NO TRIAL para ver el camino.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TrialPath({
  branch,
  done,
  onToggle,
}: {
  branch: TrialBranch;
  done: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const buying = done.has(branch.buyHead.id);
  const leaving = done.has(branch.noBuyHead.id);
  return (
    <>
      <Column live>
        {branch.steps.map((step) => (
          <Tile
            key={step.id}
            step={step}
            on={done.has(step.id)}
            tone="task"
            onToggle={onToggle}
          />
        ))}
      </Column>
      <p className="mt-3 text-center text-[11px] uppercase tracking-[0.18em] text-amber-200/80">
        {branch.decisionLabel}
      </p>
      <WaveFork compact />
      <div className="grid w-full items-start gap-4 sm:grid-cols-2">
        <Column
          live={leaving}
          head={
            <Tile
              step={branch.noBuyHead}
              on={leaving}
              tone="reject"
              onToggle={onToggle}
            />
          }
        >
          {branch.noBuy.map((step) => (
            <Tile
              key={step.id}
              step={step}
              on={done.has(step.id)}
              tone="reject"
              dim={!leaving}
              onToggle={onToggle}
            />
          ))}
          <EndTile
            label="Fin"
            on={leaving && branch.noBuy.every((x) => done.has(x.id))}
          />
        </Column>
        <Column
          live={buying}
          head={
            <Tile
              step={branch.buyHead}
              on={buying}
              tone="decision"
              onToggle={onToggle}
            />
          }
        >
          {branch.buy.map((step) => (
            <Tile
              key={step.id}
              step={step}
              on={done.has(step.id)}
              tone="task"
              dim={!buying}
              onToggle={onToggle}
            />
          ))}
          <EndTile
            label="Listo"
            on={buying && branch.buy.every((x) => done.has(x.id))}
          />
        </Column>
      </div>
    </>
  );
}

type LaneLink = "down" | "merge" | "diverge" | null;
type Lane = "left" | "center" | "right";
const LANE_X: Record<Lane, number> = { left: 50, center: 150, right: 250 };

/**
 * NO TRIAL: plan pick (one row, one of two) → "Añadir productos / extra" →
 * three parallel lanes. Center is always on; customización (left) and
 * complementos (right) are optional and dim when off.
 */
function NoTrialPath({
  done,
  onToggle,
}: {
  done: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const custom = done.has(LANE_CUSTOM.id);
  const compl = done.has(LANE_COMPL.id);
  const on: Record<Lane, boolean> = { left: custom, center: true, right: compl };
  const tile = (step: typeof NT.contract, lane: Lane) => (
    <Tile
      step={step}
      on={done.has(step.id)}
      tone="task"
      compact
      disabled={!on[lane]}
      dim={!on[lane]}
      onToggle={onToggle}
    />
  );
  const pass = <Pass />;
  const link = (l: LaneLink, c: LaneLink, r: LaneLink) => (
    <LaneLinks links={{ left: l, center: c, right: r }} on={on} />
  );
  const row = (l: ReactNode, c: ReactNode, r: ReactNode) => (
    <div className="grid w-full grid-cols-3 items-stretch gap-x-1.5 sm:gap-x-3">
      <div className="flex justify-center">{l}</div>
      <div className="flex justify-center">{c}</div>
      <div className="flex justify-center">{r}</div>
    </div>
  );
  const allDone =
    done.has(NT_PRODUCTS.id) &&
    (done.has(PLAN_VARIABLE.id) || done.has(PLAN_FIJO.id)) &&
    noTrialActiveSteps(done).every((x) => done.has(x.id));

  return (
    <div className="flex w-full flex-col items-center">
      <WaveDown hot />
      <div
        role="radiogroup"
        aria-label="Plan"
        className="grid w-full max-w-sm grid-cols-2 gap-1 rounded-2xl border border-amber-400/30 bg-ink-950/40 p-1"
      >
        {[PLAN_VARIABLE, PLAN_FIJO].map((p) => (
          <Tile
            key={p.id}
            step={p}
            on={done.has(p.id)}
            tone="decision"
            onToggle={onToggle}
          />
        ))}
      </div>
      <WaveDown hot />
      <Tile step={NT_PRODUCTS} on={done.has(NT_PRODUCTS.id)} tone="task" onToggle={onToggle} />
      {link("diverge", "down", "diverge")}
      {row(
        <Tile step={LANE_CUSTOM} on={custom} tone="decision" compact hint="Opcional" onToggle={onToggle} />,
        pass,
        <Tile step={LANE_COMPL} on={compl} tone="decision" compact hint="Opcional" onToggle={onToggle} />,
      )}
      {link("down", "down", "down")}
      {row(tile(NT.customExcel, "left"), pass, tile(NT.complExcel, "right"))}
      {link("merge", "down", "merge")}
      {row(null, tile(NT.contract, "center"), null)}
      {link(null, "down", null)}
      {row(null, tile(NT.paid, "center"), null)}
      {link(null, "down", null)}
      {row(null, tile(NT.sepa, "center"), null)}
      {link(null, "down", "diverge")}
      {row(null, pass, tile(NT.complAmazon, "right"))}
      {link(null, "down", "down")}
      {row(null, pass, tile(NT.complProduct, "right"))}
      {link(null, "down", "merge")}
      {row(null, tile(NT.ship, "center"), null)}
      {link("diverge", "down", null)}
      {row(tile(NT.customPay, "left"), tile(NT.activate, "center"), null)}
      {link("down", "down", null)}
      {row(tile(NT.customBecon, "left"), tile(NT.creds, "center"), null)}
      {link("merge", "down", null)}
      <Column live>
        {[NT.w1, NT.m1, NT.m6, NT.y1].map((step) => (
          <Tile key={step.id} step={step} on={done.has(step.id)} tone="task" onToggle={onToggle} />
        ))}
        <EndTile label="Listo" on={allDone} />
      </Column>
    </div>
  );
}

/** Center line passing a row where only a side lane has a step. */
function Pass() {
  return <div aria-hidden className="w-px self-stretch bg-aurora-300/70" />;
}

/** Connectors between lane rows: straight, lane→center merge, center→lane diverge. */
function LaneLinks({
  links,
  on,
}: {
  links: Record<Lane, LaneLink>;
  on: Record<Lane, boolean>;
}) {
  const paths: { d: string; hot: boolean; key: string }[] = [];
  for (const lane of ["left", "center", "right"] as Lane[]) {
    const kind = links[lane];
    if (!kind) continue;
    const x = LANE_X[lane];
    const c = LANE_X.center;
    const d =
      kind === "down"
        ? `M${x} 0 L${x} 28`
        : kind === "merge"
          ? `M${x} 0 C ${x} 16, ${c} 12, ${c} 28`
          : `M${c} 0 C ${c} 16, ${x} 12, ${x} 28`;
    paths.push({ d, hot: on[lane], key: lane });
  }
  return (
    <svg
      viewBox="0 0 300 28"
      preserveAspectRatio="none"
      aria-hidden
      className="h-7 w-full shrink-0"
    >
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray={p.hot ? undefined : "3 4"}
          className={p.hot ? "text-aurora-300" : "text-mist-500/50"}
        />
      ))}
    </svg>
  );
}

function Choice({
  a,
  b,
  done,
  onToggle,
}: {
  a: OnboardingStep;
  b: OnboardingStep;
  done: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-3">
      <div className="flex justify-center">
        <Tile
          step={a}
          on={done.has(a.id)}
          tone="decision"
          onToggle={onToggle}
        />
      </div>
      <div className="flex justify-center">
        <Tile
          step={b}
          on={done.has(b.id)}
          tone="decision"
          onToggle={onToggle}
        />
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
  head?: ReactNode;
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
            {skipWave ? (
              child
            ) : (
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
  return (
    !!node &&
    typeof node === "object" &&
    "type" in node &&
    node.type === WaveFork
  );
}

function Tile({
  step,
  on,
  onToggle,
  tone,
  dim = false,
  hint,
  compact = false,
  disabled = false,
}: {
  step: OnboardingStep;
  on: boolean;
  onToggle: (id: string, checked: boolean) => void;
  tone: Tone;
  dim?: boolean;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const face = on
    ? tone === "decision"
      ? "border-amber-300 bg-amber-400 text-on-accent"
      : tone === "reject"
        ? "border-rose-300 bg-rose-500 text-white"
        : "border-aurora-300 bg-aurora-400 text-on-accent"
    : tone === "decision"
      ? "border-amber-400/40 bg-ink-900/90 text-amber-100 hover:border-amber-300/70"
      : "border-white/15 bg-ink-900/90 text-mist-100 hover:border-white/30";
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onToggle(step.id, !on)}
      className={`w-full max-w-[14rem] rounded-xl border text-center transition-colors ${
        compact ? "px-1.5 py-1.5 sm:px-3" : "px-3 py-1.5"
      } ${face} ${dim ? (on ? "opacity-60" : "opacity-40") : ""} ${
        disabled ? "cursor-not-allowed" : ""
      }`}
    >
      <span
        className={`block font-medium leading-tight ${
          compact ? "text-[11px] sm:text-[13px]" : "text-[13px]"
        }`}
      >
        {step.label}
      </span>
      {hint ? (
        <span className="mt-0.5 block text-[10px] uppercase tracking-wider opacity-80">
          {hint}
        </span>
      ) : null}
    </button>
  );
}

function EndTile({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className={`mt-1 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ${
        on ? "bg-white/10 text-mist-100" : "text-mist-500"
      }`}
    >
      {label}
    </div>
  );
}

function WaveDown({ hot }: { hot: boolean }) {
  return (
    <svg
      width="24"
      height="28"
      viewBox="0 0 28 36"
      aria-hidden
      className="shrink-0"
    >
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
      className={`shrink-0 text-mist-400/80 ${compact ? "h-9 w-full max-w-[16rem]" : "h-12 w-full max-w-xl"}`}
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

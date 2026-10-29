"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LeadWithOutreach } from "@/lib/types";
import { XIcon } from "@/components/icons";
import type { OnboardingStep } from "@/lib/onboarding-path";
import {
  BRANCH_NUEVO,
  BRANCH_USADO,
  COMMON,
  CREDENTIALS_STEP_IDS,
  NO_TRIAL,
  NO_TRIAL_TREE,
  NUEVO,
  TRIAL,
  USADO,
  purchaseActiveSteps,
  toggleTreeStep,
  type PurchaseTree,
  type TreeStep,
  type TrialBranch,
} from "@/lib/lead-tree";
import {
  FOLLOW_UP_PLAN,
  activationDateOf,
  followUpDates,
  followUpKeyOfStep,
  isIsoDate,
} from "@/lib/activation-follow-ups";
import { todayIsoDate } from "@/lib/follow-ups";

type Tone = "task" | "decision" | "reject";

export function OnboardingTreeDialog({
  lead,
  onClose,
  onSetDone,
}: {
  lead: LeadWithOutreach;
  onClose: () => void;
  onSetDone: (leadTree: string[], activationDate?: string) => void;
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
  onSetDone: (leadTree: string[], activationDate?: string) => void;
}) {
  // Tree progress has its own column (lead.leadTree), so ticking steps never
  // overwrites a teammate's custom-field edit. Every lead starts from zero:
  // legacy custom-field progress is never read.
  const current = lead.leadTree ?? [];
  const done = new Set(current);
  const activation = activationDateOf(lead.customFields);
  // Ticking "Enviar credenciales" asks for the activation date first; null =
  // closed, "" = edit the date without ticking anything.
  const [askDate, setAskDate] = useState<string | null>(null);
  const toggle = (id: string, checked: boolean) => {
    if (checked && CREDENTIALS_STEP_IDS.has(id)) {
      setAskDate(id);
      return;
    }
    onSetDone(toggleTreeStep(current, id, checked));
  };
  const saveDate = (date: string) => {
    const next = askDate ? toggleTreeStep(current, askDate, true) : [...current];
    setAskDate(null);
    onSetDone(next, date);
  };
  const editActivation = () => setAskDate("");
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
        {noTrial ? (
          <PurchasePath
            tree={NO_TRIAL_TREE}
            done={done}
            onToggle={toggle}
            activation={activation}
            onEditActivation={editActivation}
          />
        ) : null}
        {trial ? (
          <>
            <WaveFork compact />
            <Choice a={NUEVO} b={USADO} done={done} onToggle={toggle} />
            {branch ? (
              <TrialPath
                branch={branch}
                done={done}
                onToggle={toggle}
                activation={activation}
                onEditActivation={editActivation}
              />
            ) : null}
          </>
        ) : null}
        {!trial && !noTrial ? (
          <p className="mt-3 text-center text-xs text-mist-500">
            Elige TRIAL o NO TRIAL para ver el camino.
          </p>
        ) : null}
      </div>
      {askDate !== null ? (
        <ActivationDialog
          initial={activation ?? todayIsoDate()}
          onCancel={() => setAskDate(null)}
          onSave={saveDate}
        />
      ) : null}
    </div>
  );
}

function TrialPath({
  branch,
  done,
  onToggle,
  activation,
  onEditActivation,
}: {
  branch: TrialBranch;
  done: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  activation: string | null;
  onEditActivation: () => void;
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
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        <div className="flex justify-center">
          <Tile step={branch.noBuyHead} on={leaving} tone="reject" onToggle={onToggle} />
        </div>
        <div className="flex justify-center">
          <Tile step={branch.buyHead} on={buying} tone="decision" onToggle={onToggle} />
        </div>
      </div>
      {leaving ? (
        <Column live>
          {branch.noBuy.map((step) => (
            <Tile
              key={step.id}
              step={step}
              on={done.has(step.id)}
              tone="reject"
              onToggle={onToggle}
            />
          ))}
          <EndTile label="Fin" on={branch.noBuy.every((x) => done.has(x.id))} />
        </Column>
      ) : null}
      {buying ? (
        <PurchasePath
          tree={branch.buy}
          done={done}
          onToggle={onToggle}
          activation={activation}
          onEditActivation={onEditActivation}
        />
      ) : null}
      {!leaving && !buying ? (
        <p className="mt-3 text-center text-xs text-mist-500">
          Elige Compra o No compra para ver el camino.
        </p>
      ) : null}
    </>
  );
}

type LaneLink = "down" | "merge" | "diverge" | null;
type Lane = "left" | "center" | "right";
const LANE_X: Record<Lane, number> = { left: 50, center: 150, right: 250 };

/**
 * Purchase tree (NO TRIAL and both trial "Compra" branches share it): optional
 * pre-steps → plan pick (one row, one of two) → "Añadir productos / extra" →
 * three parallel lanes. Center is always on; customización (left) and
 * complementos (right) are optional and dim when off. Follow-ups show the
 * date computed from the activation date.
 */
export function PurchasePath({
  tree: t,
  done,
  onToggle,
  activation,
  onEditActivation,
}: {
  tree: PurchaseTree;
  done: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  activation: string | null;
  onEditActivation: () => void;
}) {
  const custom = done.has(t.laneCustom.id);
  const compl = done.has(t.laneCompl.id);
  const on: Record<Lane, boolean> = { left: custom, center: true, right: compl };
  const tile = (step: TreeStep, lane: Lane) => (
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
    (done.has(t.planVar.id) || done.has(t.planFix.id)) &&
    purchaseActiveSteps(t, done).every((x) => done.has(x.id));
  const dates = activation ? followUpDates(activation) : null;
  const dev = t.device;

  return (
    <div className="flex w-full flex-col items-center">
      {t.pre.length ? (
        <Column live>
          {t.pre.map((step) => (
            <Tile key={step.id} step={step} on={done.has(step.id)} tone="task" onToggle={onToggle} />
          ))}
        </Column>
      ) : null}
      <WaveDown hot />
      <div
        role="radiogroup"
        aria-label="Plan"
        className="grid w-full max-w-sm grid-cols-2 gap-1 rounded-2xl border border-amber-400/30 bg-ink-950/40 p-1"
      >
        {[t.planVar, t.planFix].map((p) => (
          <Tile key={p.id} step={p} on={done.has(p.id)} tone="decision" onToggle={onToggle} />
        ))}
      </div>
      <WaveDown hot />
      <Tile step={t.products} on={done.has(t.products.id)} tone="task" onToggle={onToggle} />
      {link("diverge", "down", "diverge")}
      {row(
        <Tile step={t.laneCustom} on={custom} tone="decision" compact hint="Opcional" onToggle={onToggle} />,
        pass,
        <Tile step={t.laneCompl} on={compl} tone="decision" compact hint="Opcional" onToggle={onToggle} />,
      )}
      {link("down", "down", "down")}
      {row(tile(t.customExcel, "left"), pass, tile(t.complExcel, "right"))}
      {link("merge", "down", "merge")}
      {row(null, tile(t.contract, "center"), null)}
      {link(null, "down", null)}
      {row(null, tile(t.paid, "center"), null)}
      {link(null, "down", null)}
      {row(null, tile(t.sepa, "center"), null)}
      {link(null, "down", "diverge")}
      {row(null, pass, tile(t.complAmazon, "right"))}
      {link(null, "down", "down")}
      {row(null, pass, tile(t.complProduct, "right"))}
      {dev ? (
        <>
          {link(null, "down", "merge")}
          {row(null, tile(dev.ship, "center"), null)}
          {link("diverge", "down", null)}
          {row(tile(t.customPay, "left"), tile(dev.activate, "center"), null)}
          {link("down", "down", null)}
          {row(tile(t.customBecon, "left"), tile(dev.creds, "center"), null)}
        </>
      ) : (
        <>
          {link("diverge", "down", "merge")}
          {row(tile(t.customPay, "left"), pass, null)}
          {link("down", "down", null)}
          {row(tile(t.customBecon, "left"), pass, null)}
        </>
      )}
      {link("merge", "down", null)}
      <button
        type="button"
        onClick={onEditActivation}
        className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-mist-300 hover:border-white/30 hover:text-mist-100"
      >
        {activation
          ? `Activado el ${formatEs(activation)} · Editar`
          : "Fecha de activación · Añadir"}
      </button>
      <Column live>
        {t.followUps.map((step) => {
          const key = followUpKeyOfStep(step.id);
          const date = dates && key ? dates[key] : null;
          return (
            <Tile
              key={step.id}
              step={step}
              on={done.has(step.id)}
              tone="task"
              meta={date ? formatEs(date) : undefined}
              onToggle={onToggle}
            />
          );
        })}
        <EndTile label="Listo" on={allDone} />
      </Column>
    </div>
  );
}

function formatEs(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Asks for the software activation date (default today). */
export function ActivationDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (date: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const valid = isIsoDate(value);
  const preview = valid ? followUpDates(value) : null;
  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cancelar"
        className="absolute inset-0 bg-ink-950/70"
        onClick={onCancel}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="activation-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave(value);
        }}
        className="relative w-full max-w-sm rounded-t-3xl border border-white/10 bg-ink-900 p-5 shadow-2xl sm:rounded-3xl"
      >
        <h3 id="activation-title" className="font-display text-lg text-mist-100">
          ¿Cuándo se activó el software?
        </h3>
        <p className="mt-1 text-xs text-mist-400">
          Los seguimientos se calculan desde esta fecha y se crean como tareas destacadas en el calendario.
        </p>
        <input
          type="date"
          required
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-4 w-full rounded-xl border border-white/15 bg-ink-950/60 px-3 py-2 text-sm text-mist-100 [color-scheme:dark]"
        />
        {preview ? (
          <ul className="mt-3 space-y-1 text-xs text-mist-300">
            {FOLLOW_UP_PLAN.map((f) => (
              <li key={f.key} className="flex justify-between gap-3">
                <span>{f.label}</span>
                <span className="font-medium text-rose-300">{formatEs(preview[f.key])}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3 py-2 text-sm text-mist-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-xl bg-aurora-400 px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </form>
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
  meta,
}: {
  step: OnboardingStep;
  on: boolean;
  onToggle: (id: string, checked: boolean) => void;
  tone: Tone;
  dim?: boolean;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
  /** Small secondary line, e.g. a computed follow-up date. */
  meta?: string;
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
      {meta ? (
        <span
          className={`mt-0.5 block text-[11px] font-semibold ${on ? "" : "text-rose-300"}`}
        >
          {meta}
        </span>
      ) : null}
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

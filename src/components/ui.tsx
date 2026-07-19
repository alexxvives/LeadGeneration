import type { CrmStage, LeadStatus, OutreachStatus } from "@/lib/types";

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-ink-800/80 text-mist-300 ring-ink-600/40" },
  // Internal queue flag — CRM "New" is what users see as "needs review".
  queued: { label: "Draft ready", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/35" },
  approved: { label: "Approved", cls: "bg-aurora-400/15 text-aurora-300 ring-aurora-400/35" },
  sending: { label: "Sending…", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/35" },
  sent: { label: "Sent", cls: "bg-aurora-500/20 text-aurora-300 ring-aurora-400/40" },
  rejected: { label: "Undeliverable", cls: "bg-ink-800/60 text-mist-500 ring-ink-600/35" },
  failed: { label: "Send failed", cls: "bg-rose-500/15 text-rose-300 ring-rose-400/35" },
  draft: { label: "Draft", cls: "bg-ink-800/80 text-mist-300 ring-ink-600/40" },
};

/** Pipeline-funnel labels — keep in sync with PipelineView column titles. */
const CRM_STAGE_STYLES: Record<CrmStage, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-ink-800/80 text-mist-300 ring-ink-600/40" },
  contacted: { label: "Contacted", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/35" },
  in_conversation: {
    label: "In Conversation",
    cls: "bg-sky-400/15 text-sky-300 ring-sky-400/35",
  },
  closed: { label: "Closed", cls: "bg-aurora-500/20 text-aurora-300 ring-aurora-400/40" },
  not_interested: {
    label: "Not Interested",
    cls: "bg-rose-500/15 text-rose-300 ring-rose-400/35",
  },
};

export function StatusPill({ status }: { status: LeadStatus | OutreachStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.new;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

/** CRM funnel stage for table / list views (matches Pipeline columns). */
export function CrmStagePill({ stage }: { stage: CrmStage }) {
  const s = CRM_STAGE_STYLES[stage] ?? CRM_STAGE_STYLES.new;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export function crmStageLabel(stage: CrmStage): string {
  return CRM_STAGE_STYLES[stage]?.label ?? stage;
}

export function FitMeter({ score }: { score: number }) {
  const tone =
    score >= 75 ? "text-aurora-300" : score >= 55 ? "text-amber-300" : "text-mist-500";
  const bar =
    score >= 75 ? "bg-aurora-400" : score >= 55 ? "bg-amber-400" : "bg-mist-500";
  return (
    <div className="flex items-center gap-2">
      <div className="meter-track h-1.5 w-16 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${bar} transition-all`}
          style={{ width: `${Math.max(6, score)}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${tone}`}>{score}</span>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

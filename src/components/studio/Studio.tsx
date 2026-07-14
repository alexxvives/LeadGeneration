"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { api, QuotaExceededError, type BoardResponse, type FirecrawlUsage } from "@/lib/client-api";
import type { CrmStage, LeadWithOutreach, PlanId } from "@/lib/types";
import { SearchPanel, type SearchValues } from "./SearchPanel";
import { LeadCard } from "./LeadCard";
import { LeadTable } from "./LeadTable";
import { LeadMap } from "./LeadMap";
import { LeadDrawer } from "./LeadDrawer";
import { UpgradeModal } from "./UpgradeModal";
import { FirecrawlUsageBadge } from "./FirecrawlUsageBadge";
import { Spinner } from "@/components/ui";
import { ArrowIcon, CheckIcon, SparkIcon, MailIcon, PhoneIcon, FormIcon } from "@/components/icons";
import { ExportButton } from "./ExportButton";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type UpgradePrompt = { kind: "leads" | "sends"; planId: PlanId };

// ─── CRM Pipeline columns ────────────────────────────────────────────────────

const CRM_COLUMNS: {
  stage: CrmStage;
  title: string;
  hint: string;
  empty: string;
  color: string; // dot colour class
}[] = [
  {
    stage: "new",
    title: "New",
    hint: "Just found",
    empty: "No untouched leads — run a search to add more.",
    color: "bg-mist-500",
  },
  {
    stage: "contacted",
    title: "Contacted",
    hint: "First outreach sent",
    empty: "Send an approved email or drag a card here.",
    color: "bg-amber-400",
  },
  {
    stage: "in_conversation",
    title: "In Conversation",
    hint: "Active dialogue",
    empty: "Move here when they reply.",
    color: "bg-aurora-400",
  },
  {
    stage: "closed",
    title: "Closed",
    hint: "Won — became a client",
    empty: "Move here when you close the deal.",
    color: "bg-aurora-300",
  },
  {
    stage: "not_interested",
    title: "Not Interested",
    hint: "Lost",
    empty: "Move here when they decline.",
    color: "bg-rose-400",
  },
];

// Email-workflow status badge inside a pipeline card.
const EMAIL_STATUS_BADGE: Record<string, { label: string; cls: string } | undefined> = {
  queued:   { label: "Draft ready", cls: "bg-amber-400/15 text-amber-300" },
  approved: { label: "Approved",    cls: "bg-aurora-400/15 text-aurora-300" },
  sent:     { label: "Sent",        cls: "bg-aurora-500/20 text-aurora-300" },
  failed:   { label: "Failed",      cls: "bg-rose-500/15 text-rose-300" },
};

// ─── Studio root ─────────────────────────────────────────────────────────────

export function Studio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: "board" | "pipeline" | "runs" =
    searchParams.get("view") === "pipeline"
      ? "pipeline"
      : searchParams.get("view") === "runs"
        ? "runs"
        : "board";

  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"table" | "cards" | "map">("table");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [upgrade, setUpgrade] = useState<UpgradePrompt | null>(null);
  const [fcUsageKey, setFcUsageKey] = useState(0);
  const [fcBefore, setFcBefore] = useState<FirecrawlUsage | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  const setView = useCallback(
    (next: "board" | "pipeline" | "runs") => {
      const q =
        next === "pipeline" ? "?view=pipeline" : next === "runs" ? "?view=runs" : "";
      router.replace(`/app${q}`, { scroll: false });
    },
    [router],
  );

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof QuotaExceededError) {
        setUpgrade({ kind: e.kind, planId: e.planId });
      } else {
        toast("err", (e as Error).message);
      }
    },
    [toast],
  );

  const refresh = useCallback(async () => {
    const data = await api.board();
    const pinned = activeRunIdRef.current;
    if (pinned && pinned !== data.run?.id) {
      try {
        const { run, leads } = await api.runWithLeads(pinned);
        const merged = { ...data, run, leads };
        setBoard(merged);
        return merged;
      } catch {
        activeRunIdRef.current = null;
        setActiveRunId(null);
      }
    }
    setBoard(data);
    return data;
  }, []);

  const loadRunOnBoard = useCallback(
    async (runId: string) => {
      activeRunIdRef.current = runId;
      setActiveRunId(runId);
      try {
        await refresh();
        setView("pipeline");
      } catch (e) {
        handleError(e);
      }
    },
    [refresh, setView, handleError],
  );

  useEffect(() => {
    refresh()
      .catch((e) => toast("err", e.message))
      .finally(() => setLoading(false));
  }, [refresh, toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      toast("ok", "Upgrade complete — your new plan is active.");
      window.history.replaceState({}, "", "/app");
    }
  }, [toast]);

  const runSearch = async (v: SearchValues) => {
    setRunning(true);
    let before: FirecrawlUsage | null = null;
    try {
      before = await api.firecrawlUsage().catch(() => null);
      setFcBefore(before);
      activeRunIdRef.current = null;
      setActiveRunId(null);
      await api.createRun({
        niche: v.niche,
        location: v.location,
        senderName: v.senderName,
        searchStrategy: v.searchStrategy,
      });
      const data = await refresh();
      const n = data.leads.length;
      setFcUsageKey((k) => k + 1);
      toast(
        "ok",
        `${data.run?.mode === "live" ? "Live search" : "Search"} complete — ${n} lead${n === 1 ? "" : "s"} charted.`,
      );
      setView("pipeline");
    } catch (e) {
      handleError(e);
    } finally {
      setRunning(false);
    }
  };

  const loadDemo = async () => {
    setRunning(true);
    activeRunIdRef.current = null;
    setActiveRunId(null);
    try {
      await api.createRun({
        niche: "boutique dental clinics",
        location: "Austin, TX",
        offerNotes:
          "We build booking sites that turn website visitors into scheduled appointments.",
        demo: true,
      });
      await refresh();
      toast("ok", "Demo board loaded — no provider credits used.");
      setView("pipeline");
    } catch (e) {
      handleError(e);
    } finally {
      setRunning(false);
    }
  };

  const clearBoardData = async () => {
    try {
      activeRunIdRef.current = null;
      setActiveRunId(null);
      await api.clearBoard();
      await refresh();
      toast("ok", "Board cleared.");
      setView("board"); // go to Search so they can start a new search
    } catch (e) {
      handleError(e);
    }
  };

  const patchLeadLocal = (leadId: string, next: Partial<LeadWithOutreach>) => {
    setBoard((b) =>
      b ? { ...b, leads: b.leads.map((l) => (l.id === leadId ? { ...l, ...next } : l)) } : b,
    );
  };

  const onDraft = async (leadId: string) => {
    try {
      const { outreach } = await api.draft(leadId);
      patchLeadLocal(leadId, { outreach, status: "queued" });
      toast("ok", "Draft written. Review before approving.");
    } catch (e) {
      toast("err", (e as Error).message);
    }
  };

  const findLeadByOutreach = (outreachId: string) =>
    board?.leads.find((l) => l.outreach?.id === outreachId);

  const onSaveDraft = async (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
  ) => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, patch);
      const lead = findLeadByOutreach(outreachId);
      if (lead) patchLeadLocal(lead.id, { outreach });
      toast("ok", "Edits saved.");
    } catch (e) {
      toast("err", (e as Error).message);
    }
  };

  const onDecide = async (outreachId: string, decision: "approved" | "rejected") => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, { decision });
      const lead = findLeadByOutreach(outreachId);
      if (lead) {
        patchLeadLocal(lead.id, {
          outreach,
          status: decision === "approved" ? "approved" : "rejected",
        });
      }
      toast("ok", decision === "approved" ? "Approved — ready to send." : "Rejected.");
    } catch (e) {
      toast("err", (e as Error).message);
    }
  };

  const onSend = async (outreachId: string) => {
    try {
      await api.send(outreachId);
      await refresh();
      toast("ok", board?.capabilities.canSendEmail ? "Email sent." : "Sent in demo mode (not delivered).");
    } catch (e) {
      handleError(e);
    }
  };

  const onMoveStage = async (leadId: string, stage: CrmStage) => {
    // Optimistic update first for instant feel.
    patchLeadLocal(leadId, { crmStage: stage });
    try {
      const { lead } = await api.updateLead(leadId, { crmStage: stage });
      patchLeadLocal(leadId, lead);
    } catch (e) {
      // Revert on failure by refreshing.
      await refresh();
      toast("err", (e as Error).message);
    }
  };

  const onUpdateLeadCrm = async (
    leadId: string,
    patch: Parameters<typeof api.updateLead>[1],
  ) => {
    patchLeadLocal(leadId, patch as Partial<LeadWithOutreach>);
    try {
      const { lead } = await api.updateLead(leadId, patch);
      patchLeadLocal(leadId, lead);
    } catch (e) {
      toast("err", (e as Error).message);
    }
  };

  const selected = board?.leads.find((l) => l.id === selectedId) ?? null;

  const approvedLeads = useMemo(
    () => board?.leads.filter((l) => l.status === "approved" && l.outreach) ?? [],
    [board],
  );

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="h-8 w-8 text-aurora-400" />
      </div>
    );
  }

  const hasLeads = (board?.leads.length ?? 0) > 0;
  const canSearchLive = board?.capabilities.canSearchLive ?? false;

  return (
    <main className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {view === "pipeline" ? "Pipeline" : view === "runs" ? "Search runs" : "Search"}
          </h1>
          <p className="mt-1 text-mist-500">
            {view === "pipeline"
              ? hasLeads
                ? `${board!.leads.length} prospect${board!.leads.length === 1 ? "" : "s"}${board!.run?.niche ? ` for "${board!.run.niche}"` : ""} — drag to move between stages.`
                : "Drag leads through your sales funnel — New → Contacted → In Conversation → Closed."
              : view === "runs"
                ? "History of searches in this workspace."
                : "Find prospects by niche and location."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {view === "board" && board?.capabilities.firecrawl && (
            <FirecrawlUsageBadge refreshKey={fcUsageKey} before={fcBefore} />
          )}
        </div>
      </div>

      {/* Search view — always show the full panel */}
      {view === "board" && (
        <div className="mb-8">
          <SearchPanel onSearch={runSearch} running={running} compact={false} />
          {!canSearchLive && !hasLeads && (
            <p className="mt-3 text-xs text-mist-500">
              No Firecrawl/Exa key — live search is unavailable. Use{" "}
              <span className="text-mist-300">Load demo data</span> below, or add a key in
              Settings.
            </p>
          )}
          {hasLeads && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/5 bg-ink-900/40 px-4 py-3">
              <span className="text-sm text-mist-300">
                <span className="font-semibold text-aurora-300">{board!.leads.length}</span>{" "}
                lead{board!.leads.length === 1 ? "" : "s"} in your pipeline
                {board!.run?.niche ? ` for "${board!.run.niche}"` : ""}.
              </span>
              <button
                type="button"
                onClick={() => setView("pipeline")}
                className="ml-auto text-sm text-aurora-300 underline-offset-2 hover:underline"
              >
                View Pipeline →
              </button>
              <button
                type="button"
                onClick={clearBoardData}
                className="text-xs text-mist-500 transition-colors hover:text-mist-200"
              >
                Clear
              </button>
            </div>
          )}
          {!hasLeads && <EmptyState onLoadDemo={loadDemo} running={running} />}
        </div>
      )}

      {/* Pipeline view — kanban + full leads table below */}
      {view === "pipeline" && (
        hasLeads ? (
          <>
            <PipelineView
              leads={board!.leads}
              approvedLeads={approvedLeads}
              onOpen={(id) => setSelectedId(id)}
              onMoveStage={onMoveStage}
              onDraft={onDraft}
              onDecide={onDecide}
              onSend={onSend}
              canSend={board!.capabilities.canSendEmail}
            />
            <div className="mt-10">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-mist-500">
                  All leads
                </p>
                <div className="flex items-center gap-3">
                  <ExportButton />
                  <div className="glass inline-flex items-center rounded-full p-1 text-sm">
                    <LayoutToggle active={layout === "table"} onClick={() => setLayout("table")}>
                      Table
                    </LayoutToggle>
                    <LayoutToggle active={layout === "cards"} onClick={() => setLayout("cards")}>
                      Cards
                    </LayoutToggle>
                    <LayoutToggle active={layout === "map"} onClick={() => setLayout("map")}>
                      Map
                    </LayoutToggle>
                  </div>
                </div>
              </div>
              {layout === "map" ? (
                <LeadMap
                  leads={board!.leads}
                  locationHint={board!.run?.location ?? null}
                  onOpen={(id) => setSelectedId(id)}
                />
              ) : layout === "cards" ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {board!.leads.map((lead, i) => (
                    <LeadCard key={lead.id} lead={lead} index={i} onOpen={() => setSelectedId(lead.id)} />
                  ))}
                </div>
              ) : (
                <LeadTable leads={board!.leads} onOpen={(id) => setSelectedId(id)} />
              )}
            </div>
          </>
        ) : (
          <EmptyState onLoadDemo={loadDemo} running={running} />
        )
      )}

      {/* Runs view */}
      {view === "runs" && (
        <RunsView
          activeRunId={activeRunId ?? board?.run?.id ?? null}
          onOpenRun={loadRunOnBoard}
        />
      )}

      {selected && board && (
        <LeadDrawer
          lead={selected}
          capabilities={board.capabilities}
          onClose={() => setSelectedId(null)}
          onDraft={onDraft}
          onSaveDraft={onSaveDraft}
          onDecide={onDecide}
          onSend={onSend}
          onUpdateCrm={onUpdateLeadCrm}
        />
      )}

      {upgrade && (
        <UpgradeModal
          kind={upgrade.kind}
          planId={upgrade.planId}
          onClose={() => setUpgrade(null)}
        />
      )}

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-float-up pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-xl ring-1 ${
              t.kind === "ok"
                ? "bg-ink-800 text-aurora-200 ring-aurora-400/25"
                : "bg-ink-800 text-rose-200 ring-rose-400/30"
            }`}
          >
            {t.kind === "ok" ? <CheckIcon className="h-4 w-4" /> : <span>⚠</span>}
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────


function LayoutToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-medium transition-colors ${
        active ? "bg-white/10 text-mist-100" : "text-mist-500 hover:text-mist-300"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({
  onLoadDemo,
  running,
}: {
  onLoadDemo: () => void;
  running: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl2 border border-white/10">
      <Image
        src="/images/empty-aurora.jpg"
        alt=""
        width={1600}
        height={900}
        className="h-72 w-full object-cover opacity-60 sm:h-[22rem]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-8">
        <SparkIcon className="h-7 w-7 text-aurora-300" />
        <h2 className="mt-3 font-display text-2xl font-semibold">Your board is clear</h2>
        <p className="mt-1 max-w-lg text-mist-300">
          Run a live search above, or load sample leads to try the approve → send flow
          without spending provider credits.
        </p>
        <button
          type="button"
          onClick={onLoadDemo}
          disabled={running}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.03] disabled:opacity-50"
        >
          {running ? <Spinner className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}
          Load demo data
        </button>
      </div>
    </div>
  );
}

// ─── Pipeline (CRM kanban with drag-and-drop) ─────────────────────────────────

// Next CRM stage for the quick-advance button on each card.
const NEXT_CRM_STAGE: Partial<Record<CrmStage, CrmStage>> = {
  new: "contacted",
  contacted: "in_conversation",
  in_conversation: "closed",
};

function PipelineView({
  leads,
  approvedLeads,
  onOpen,
  onMoveStage,
  onDraft,
  onDecide,
  onSend,
  canSend,
}: {
  leads: LeadWithOutreach[];
  approvedLeads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  onDraft: (leadId: string) => Promise<void>;
  onDecide: (outreachId: string, decision: "approved" | "rejected") => Promise<void>;
  onSend: (outreachId: string) => Promise<void>;
  canSend: boolean;
}) {
  const [sendingAll, setSendingAll] = useState(false);
  const [draftingAll, setDraftingAll] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Leads with a draft ready for review (lead status "queued" = draft written, awaiting approval).
  const queuedLeads = leads.filter((l) => l.status === "queued" && l.outreach);
  const undraftedLeads = leads.filter((l) => l.status === "new" && !l.outreach && l.emails.length > 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const lead = leads.find((l) => l.id === active.id);
    const newStage = over.id as CrmStage;
    if (!lead || lead.crmStage === newStage) return;
    onMoveStage(String(active.id), newStage);
  }

  const sendAllApproved = async () => {
    setSendingAll(true);
    for (const l of approvedLeads) {
      if (l.outreach) await onSend(l.outreach.id);
    }
    setSendingAll(false);
  };

  const draftAll = async () => {
    setDraftingAll(true);
    for (const l of undraftedLeads) await onDraft(l.id);
    setDraftingAll(false);
  };

  const approveAll = async () => {
    setApprovingAll(true);
    for (const l of queuedLeads) {
      if (l.outreach) await onDecide(l.outreach.id, "approved");
    }
    setApprovingAll(false);
  };

  // Collect all active bulk actions to show in one bar.
  const bulkActions: React.ReactNode[] = [];
  if (undraftedLeads.length > 0) {
    bulkActions.push(
      <button
        key="draft-all"
        onClick={draftAll}
        disabled={draftingAll}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        {draftingAll ? <Spinner className="h-3.5 w-3.5" /> : <SparkIcon className="h-3.5 w-3.5 text-aurora-300" />}
        Draft all ({undraftedLeads.length})
      </button>,
    );
  }
  if (queuedLeads.length > 0) {
    bulkActions.push(
      <button
        key="approve-all"
        onClick={approveAll}
        disabled={approvingAll}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        {approvingAll ? <Spinner className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5 text-aurora-300" />}
        Approve all drafts ({queuedLeads.length})
      </button>,
    );
  }
  if (approvedLeads.length > 0) {
    bulkActions.push(
      <button
        key="send-all"
        onClick={sendAllApproved}
        disabled={sendingAll}
        className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-4 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
      >
        {sendingAll ? <Spinner className="h-3.5 w-3.5" /> : <ArrowIcon className="h-3.5 w-3.5" />}
        {canSend ? `Send all (${approvedLeads.length})` : `Send demo (${approvedLeads.length})`}
      </button>,
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk-action bar — only shown when there's something to do */}
      {bulkActions.length > 0 && (
        <div className="glass flex flex-wrap items-center justify-end gap-2 rounded-xl2 p-3">
          <p className="mr-auto text-xs text-mist-500">Bulk actions</p>
          {bulkActions}
        </div>
      )}

      <p className="text-xs uppercase tracking-widest text-mist-500">
        <span className="font-semibold text-mist-200">{leads.length}</span> lead
        {leads.length === 1 ? "" : "s"} · drag to move between stages
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${CRM_COLUMNS.length}, minmax(0, 1fr))` }}>
          {CRM_COLUMNS.map((col) => {
            const colLeads = leads.filter((l) => l.crmStage === col.stage);
            return (
              <PipelineColumn
                key={col.stage}
                col={col}
                leads={colLeads}
                onOpen={onOpen}
                onMoveStage={onMoveStage}
                activeId={activeId}
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeLead ? (
            <div className="w-60 rotate-2 cursor-grabbing rounded-xl border border-aurora-400/40 bg-ink-800 px-3 py-3 shadow-2xl">
              <p className="truncate text-sm font-medium text-mist-100">{activeLead.company}</p>
              <p className="mt-1 truncate text-xs text-mist-500">
                {activeLead.emails[0] ?? activeLead.website ?? "No contact yet"}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function PipelineColumn({
  col,
  leads,
  onOpen,
  onMoveStage,
  activeId,
}: {
  col: (typeof CRM_COLUMNS)[number];
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl2 border transition-colors ${
        isOver ? "border-aurora-400/40 bg-aurora-400/5" : "border-white/10 bg-ink-950/40"
      }`}
    >
      <div className="border-b border-white/5 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${col.color}`} />
            <h3 className="text-sm font-semibold text-mist-100">{col.title}</h3>
          </div>
          <span className="font-display text-lg tabular-nums text-aurora-300">{leads.length}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-mist-500">{col.hint}</p>
      </div>
      <div className="flex max-h-[min(60vh,520px)] flex-col gap-2 overflow-y-auto p-3">
        {leads.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-mist-500">
            {col.empty}
          </p>
        ) : (
          leads.map((l) => (
            <DraggablePipelineCard
              key={l.id}
              lead={l}
              onOpen={onOpen}
              onMoveStage={onMoveStage}
              isDragging={l.id === activeId}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DraggablePipelineCard({
  lead,
  onOpen,
  onMoveStage,
  isDragging,
}: {
  lead: LeadWithOutreach;
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });
  const emailBadge = lead.outreach ? EMAIL_STATUS_BADGE[lead.outreach.status] : undefined;
  const pendingFollowUps = lead.followUps?.filter((f) => !f.done).length ?? 0;
  const nextStage = lead.crmStage ? NEXT_CRM_STAGE[lead.crmStage] : undefined;

  // Subtitle: category tag only (no location — keeps cards readable).
  const subtitle = lead.tags[0] ?? lead.emails[0] ?? lead.website ?? null;

  return (
    <div
      ref={setNodeRef}
      className={`group rounded-xl border border-white/5 bg-ink-900/60 transition-opacity ${
        isDragging ? "opacity-30" : ""
      }`}
      {...attributes}
    >
      <div className="flex items-start gap-0.5">
        {/* Drag grip */}
        <button
          {...listeners}
          className="cursor-grab touch-none px-1.5 py-3 text-mist-500 hover:text-mist-300 active:cursor-grabbing"
          aria-label="Drag to move"
          tabIndex={-1}
        >
          <svg viewBox="0 0 6 12" className="h-3 w-3 fill-current" aria-hidden>
            <circle cx="1.5" cy="1.5" r="1" /><circle cx="4.5" cy="1.5" r="1" />
            <circle cx="1.5" cy="4.5" r="1" /><circle cx="4.5" cy="4.5" r="1" />
            <circle cx="1.5" cy="7.5" r="1" /><circle cx="4.5" cy="7.5" r="1" />
            <circle cx="1.5" cy="10.5" r="1" /><circle cx="4.5" cy="10.5" r="1" />
          </svg>
        </button>

        {/* Card body — click to open drawer */}
        <button
          type="button"
          onClick={() => onOpen(lead.id)}
          className="min-w-0 flex-1 py-3 text-left transition-colors hover:bg-white/5 rounded-r-xl"
        >
          <p className="truncate text-sm font-medium text-mist-100">{lead.company}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-mist-500">{subtitle}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {emailBadge && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${emailBadge.cls}`}>
                {emailBadge.label}
              </span>
            )}
            {pendingFollowUps > 0 && (
              <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                {pendingFollowUps} follow-up{pendingFollowUps > 1 ? "s" : ""}
              </span>
            )}
            {lead.contactMethod && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-mist-500"
                title={
                  lead.contactMethod === "email"
                    ? "Contacted by email"
                    : lead.contactMethod === "phone"
                      ? "Contacted by phone"
                      : "Contacted via form"
                }
              >
                {lead.contactMethod === "email" && <MailIcon className="h-2.5 w-2.5" />}
                {lead.contactMethod === "phone" && <PhoneIcon className="h-2.5 w-2.5" />}
                {lead.contactMethod === "contact_form" && <FormIcon className="h-2.5 w-2.5" />}
              </span>
            )}
          </div>
        </button>

        {/* Quick-advance button — appears on hover, moves to next stage */}
        {nextStage && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveStage(lead.id, nextStage); }}
            title={`Move to ${CRM_COLUMNS.find((c) => c.stage === nextStage)?.title ?? nextStage}`}
            className="self-center mr-2 rounded-md p-1 text-mist-600 opacity-0 transition-all hover:bg-white/10 hover:text-aurora-300 group-hover:opacity-100"
          >
            <ArrowIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Runs view ────────────────────────────────────────────────────────────────

function RunsView({
  activeRunId,
  onOpenRun,
}: {
  activeRunId: string | null;
  onOpenRun: (runId: string) => void;
}) {
  const [runs, setRuns] = useState<import("@/lib/types").Run[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRuns()
      .then((r) => setRuns(r.runs))
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) {
    return (
      <div className="rounded-xl2 border border-rose-400/20 bg-rose-400/5 px-5 py-4 text-sm text-rose-200">
        {err}
      </div>
    );
  }
  if (!runs) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Spinner className="h-7 w-7 text-aurora-400" />
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <div className="glass rounded-xl2 p-10 text-center text-mist-300">
        No searches yet. Run one from the Board.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl2 border border-white/10">
      {runs.map((r, i) => {
        const isActive = r.id === activeRunId;
        const openable = r.status === "complete" && r.leadCount > 0;
        return (
          <div
            key={r.id}
            className={`flex flex-wrap items-center gap-4 px-5 py-4 ${
              i > 0 ? "border-t border-white/5" : ""
            } ${isActive ? "bg-aurora-400/5" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {r.niche}
                {r.location ? (
                  <span className="text-mist-500"> · {r.location}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-mist-500">
                {new Date(r.createdAt).toLocaleString()} · {r.provider} · {r.mode}
              </p>
            </div>
            <span className="text-sm tabular-nums text-mist-300">{r.leadCount} leads</span>
            <span
              className={`text-xs font-medium uppercase tracking-wider ${
                r.status === "complete"
                  ? "text-aurora-300"
                  : r.status === "failed"
                    ? "text-rose-300"
                    : "text-amber-300"
              }`}
            >
              {r.status}
            </span>
            {isActive ? (
              <span className="rounded-full border border-aurora-400/30 bg-aurora-400/10 px-3 py-1 text-xs font-medium text-aurora-300">
                On board
              </span>
            ) : (
              openable && (
                <button
                  type="button"
                  onClick={() => onOpenRun(r.id)}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-300 transition-colors hover:border-white/20 hover:text-mist-100"
                >
                  Open on board
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

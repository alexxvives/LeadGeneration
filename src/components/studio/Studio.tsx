"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, QuotaExceededError, type BoardResponse, type FirecrawlUsage } from "@/lib/client-api";
import type { CrmStage, LeadWithOutreach, PlanId } from "@/lib/types";
import { SearchPanel, type SearchValues } from "./SearchPanel";
import { LeadCard } from "./LeadCard";
import { LeadTable } from "./LeadTable";
import { LeadMap } from "./LeadMap";
import { LeadDrawer } from "./LeadDrawer";
import { UpgradeModal, UsageBar } from "./UpgradeModal";
import { FirecrawlUsageBadge } from "./FirecrawlUsageBadge";
import { Spinner } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { ExportButton } from "./ExportButton";
import { PipelineView } from "./PipelineView";
import { RunsView } from "./RunsView";
import { LayoutToggle, EmptyState, SearchProgress } from "./StudioHelpers";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type UpgradePrompt = { kind: "leads" | "sends"; planId: PlanId };

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
        offerNotes: v.offerNotes.trim() || undefined,
        maxLeads: v.maxLeads,
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
      toast("ok", board?.capabilities.canSendEmail ? "Email sent." : "Sent (simulated — not delivered).");
    } catch (e) {
      handleError(e);
    }
  };

  const onSetDelivery = async (
    outreachId: string,
    deliveryStatus: "unknown" | "sent" | "bounced" | "replied",
  ) => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, { deliveryStatus });
      await refresh();
      const lead = findLeadByOutreach(outreachId);
      if (lead) patchLeadLocal(lead.id, { outreach });
      toast(
        "ok",
        deliveryStatus === "replied"
          ? "Marked replied — moved to In Conversation."
          : deliveryStatus === "bounced"
            ? "Marked bounced."
            : "Delivery status updated.",
      );
    } catch (e) {
      toast("err", (e as Error).message);
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
          {board?.workspace?.metered && (
            <div className="hidden min-w-[16rem] grid-cols-2 gap-3 sm:grid sm:min-w-[20rem]">
              <UsageBar
                label="Leads"
                used={board.workspace.leadsUsed}
                limit={board.workspace.leadsLimit}
              />
              <UsageBar
                label="Sends"
                used={board.workspace.sendsUsed}
                limit={board.workspace.sendsLimit}
              />
            </div>
          )}
          {view === "board" && board?.capabilities.firecrawl && (
            <FirecrawlUsageBadge refreshKey={fcUsageKey} before={fcBefore} />
          )}
        </div>
      </div>

      {/* Search view — always show the full panel */}
      {view === "board" && (
        <div className="mb-8">
          <SearchPanel
            onSearch={runSearch}
            running={running}
            compact={false}
            planId={board?.workspace?.planId ?? "free"}
            leadsRemaining={
              board?.workspace?.metered
                ? Math.max(0, board.workspace.leadsLimit - board.workspace.leadsUsed)
                : null
            }
          />
          {running && <SearchProgress running={running} />}
          {!canSearchLive && !hasLeads && !running && (
            <p className="mt-3 text-xs text-mist-500">
              No Firecrawl/Exa key — live search is unavailable. Use{" "}
              <span className="text-mist-300">Load demo data</span> below, or add a key in
              Settings.
            </p>
          )}
          {hasLeads && !running && (
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
          {!hasLeads && !running && <div className="mt-6"><EmptyState onLoadDemo={loadDemo} running={running} /></div>}
        </div>
      )}

      {/* Pipeline view — kanban + full leads table below */}
      {view === "pipeline" && (
        hasLeads ? (
          <div data-tour="pipeline">
            <PipelineView
              leads={board!.leads}
              onOpen={(id) => setSelectedId(id)}
              onMoveStage={onMoveStage}
              onDraft={onDraft}
              onDecide={onDecide}
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
          </div>
        ) : (
          <div data-tour="pipeline">
            <EmptyState onLoadDemo={loadDemo} running={running} />
          </div>
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
          onSetDelivery={onSetDelivery}
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

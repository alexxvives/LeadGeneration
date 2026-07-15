"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, QuotaExceededError, type BoardResponse, type FirecrawlUsage } from "@/lib/client-api";
import type { ContactMethod, CrmStage, LeadWithOutreach, PlanId } from "@/lib/types";
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
import { OutreachView } from "./OutreachView";
import { RunsView } from "./RunsView";
import { ImportLeadsPanel } from "./ImportLeadsPanel";
import { LayoutToggle, EmptyState, SearchProgress } from "./StudioHelpers";
import { recordWarmupSend, warmupStatus } from "@/lib/email/warmup";
import { loadSenderProfile, resolveSignature } from "@/lib/sender-profile";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type UpgradePrompt = { kind: "leads" | "sends"; planId: PlanId };
type StudioView = "board" | "pipeline" | "leads" | "outreach" | "runs";

function viewFromParams(view: string | null): StudioView {
  if (view === "pipeline") return "pipeline";
  if (view === "leads") return "leads";
  if (view === "outreach") return "outreach";
  if (view === "runs") return "runs";
  return "board";
}

function queryForView(next: StudioView): string {
  if (next === "pipeline") return "?view=pipeline";
  if (next === "leads") return "?view=leads";
  if (next === "outreach") return "?view=outreach";
  if (next === "runs") return "?view=runs";
  return "";
}

// ─── Studio root ─────────────────────────────────────────────────────────────

export function Studio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = viewFromParams(searchParams.get("view"));

  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<"info" | "draft">("info");
  const [layout, setLayout] = useState<"table" | "cards" | "map">("table");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [upgrade, setUpgrade] = useState<UpgradePrompt | null>(null);
  const [fcUsageKey, setFcUsageKey] = useState(0);
  const [fcBefore, setFcBefore] = useState<FirecrawlUsage | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [outreachBusy, setOutreachBusy] = useState<string | null>(null);
  const [pendingSendId, setPendingSendId] = useState<string | null>(null);
  const [warmupWarn, setWarmupWarn] = useState<{
    outreachId: string;
    todayCount: number;
    softCap: number;
  } | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  const setView = useCallback(
    (next: StudioView) => {
      router.replace(`/app${queryForView(next)}`, { scroll: false });
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

  const patchLeadLocal = (leadId: string, next: Partial<LeadWithOutreach>) => {
    setBoard((b) =>
      b ? { ...b, leads: b.leads.map((l) => (l.id === leadId ? { ...l, ...next } : l)) } : b,
    );
  };

  const onDraft = async (leadId: string) => {
    try {
      const profile = loadSenderProfile();
      const { outreach } = await api.draft(leadId, {
        signOff: resolveSignature(profile),
        offerNotes: profile.defaultOffer.trim() || undefined,
      });
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
    opts?: { silent?: boolean },
  ) => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, patch);
      const lead = findLeadByOutreach(outreachId);
      if (lead) patchLeadLocal(lead.id, { outreach });
      if (!opts?.silent) toast("ok", "Edits saved.");
    } catch (e) {
      toast("err", (e as Error).message);
      throw e;
    }
  };

  const onDecide = async (
    outreachId: string,
    decision: "approved" | "rejected",
    opts?: { silent?: boolean },
  ) => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, { decision });
      const lead = findLeadByOutreach(outreachId);
      if (lead) {
        patchLeadLocal(lead.id, {
          outreach,
          status: decision === "approved" ? "approved" : "rejected",
        });
      }
      if (!opts?.silent) {
        toast("ok", decision === "approved" ? "Approved — ready to send." : "Rejected.");
      }
    } catch (e) {
      toast("err", (e as Error).message);
      if (opts?.silent) throw e;
    }
  };

  const onSend = async (outreachId: string) => {
    try {
      const result = await api.send(outreachId);
      recordWarmupSend();
      await refresh();
      toast(
        "ok",
        result.provider === "demo"
          ? "Sent (simulated — not delivered)."
          : "Email sent.",
      );
    } catch (e) {
      await refresh();
      const msg = (e as Error).message;
      if (/must be approved/i.test(msg)) {
        toast("err", "Approve the draft first, then send. (If a prior send failed, re-approve and retry.)");
      } else if (/undeliverable/i.test(msg)) {
        toast("err", msg);
      } else if (/domain|verified|from/i.test(msg)) {
        toast(
          "err",
          `${msg} — In Settings → Sending: set From email on the domain verified with the provider you selected (Resend or Maileroo), then retry.`,
        );
      } else {
        handleError(e);
      }
    }
  };

  const runSend = async (outreachId: string) => {
    setOutreachBusy(outreachId);
    try {
      await onSend(outreachId);
    } finally {
      setOutreachBusy(null);
    }
  };

  /** Real delivery needs a provider; otherwise confirm simulate-or-settings. Soft warmup warn if over recommend. */
  const requestSend = (outreachId: string) => {
    if (!board?.capabilities.canSendEmail) {
      setPendingSendId(outreachId);
      return;
    }
    const status = warmupStatus();
    if (status.overSoftCap) {
      setWarmupWarn({
        outreachId,
        todayCount: status.todayCount,
        softCap: status.softCap,
      });
      return;
    }
    void runSend(outreachId);
  };

  const confirmSimulateSend = async () => {
    const id = pendingSendId;
    setPendingSendId(null);
    if (!id) return;
    await runSend(id);
  };

  const confirmWarmupSend = async () => {
    const id = warmupWarn?.outreachId;
    setWarmupWarn(null);
    if (!id) return;
    await runSend(id);
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

  const onMoveStage = async (
    leadId: string,
    stage: CrmStage,
    contactMethod?: ContactMethod | null,
  ) => {
    const patch: { crmStage: CrmStage; contactMethod?: ContactMethod | null } = {
      crmStage: stage,
    };
    if (contactMethod !== undefined) patch.contactMethod = contactMethod;
    // Optimistic update first for instant feel.
    patchLeadLocal(leadId, patch);
    try {
      const { lead } = await api.updateLead(leadId, patch);
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

  const onDraftAllOutreach = async () => {
    if (!board) return;
    const targets = board.leads.filter((l) => !l.outreach && l.emails.length > 0);
    setOutreachBusy("draft-all");
    try {
      for (const l of targets) await onDraft(l.id);
    } finally {
      setOutreachBusy(null);
    }
  };

  const onApproveAllOutreach = async () => {
    if (!board) return;
    const targets = board.leads.filter(
      (l) =>
        l.outreach &&
        (l.outreach.status === "draft" ||
          l.outreach.status === "rejected" ||
          l.outreach.status === "failed"),
    );
    setOutreachBusy("approve-all");
    let approved = 0;
    try {
      for (const l of targets) {
        if (!l.outreach) continue;
        await onDecide(l.outreach.id, "approved", { silent: true });
        approved += 1;
      }
      if (approved > 0) {
        toast(
          "ok",
          `Approved ${approved} draft${approved === 1 ? "" : "s"} — ready to send.`,
        );
      }
    } catch {
      /* per-item toast already shown */
    } finally {
      setOutreachBusy(null);
    }
  };

  const openInfo = (id: string) => {
    setDrawerMode("info");
    setSelectedId(id);
  };
  const openDraft = (id: string) => {
    setDrawerMode("draft");
    setSelectedId(id);
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
  const lockViewport =
    view === "pipeline" || view === "outreach" || view === "leads";

  return (
    <main
      className={
        lockViewport
          ? "mx-auto flex h-dvh max-w-7xl flex-col overflow-hidden px-5 pb-3 pt-4 sm:px-8 sm:pt-5"
          : "mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8"
      }
    >
      <div
        className={`flex flex-wrap items-end justify-between gap-4 ${
          lockViewport ? "mb-3 shrink-0" : "mb-6"
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {view === "pipeline"
                ? "Pipeline"
                : view === "leads"
                  ? "Leads"
                  : view === "outreach"
                    ? "Outreach"
                    : view === "runs"
                      ? "Search runs"
                      : "Search"}
            </h1>
            {view === "leads" && hasLeads ? <ExportButton /> : null}
          </div>
          {view === "runs" || view === "board" ? (
            <p className="mt-1 text-mist-500">
              {view === "runs"
                ? "History of searches in this workspace."
                : "Find prospects by niche and location."}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {board?.workspace && (
            <div className="hidden min-w-[16rem] flex-col gap-1 sm:flex sm:min-w-[20rem]">
              <div className="grid grid-cols-2 gap-3">
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
              {!board.workspace.metered && (
                <p className="text-[10px] text-mist-500">
                  Local preview — quotas enforced on the live app
                </p>
              )}
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
          {!running && (
            <ImportLeadsPanel
              activeRunId={activeRunId ?? board?.run?.id ?? null}
              boardLeadCount={board?.leads.length ?? 0}
              onImported={async (runId) => {
                if (runId) await loadRunOnBoard(runId);
                else await refresh();
                setView("leads");
              }}
            />
          )}
          {!hasLeads && !running && <div className="mt-6"><EmptyState onLoadDemo={loadDemo} running={running} /></div>}
        </div>
      )}

      {/* Pipeline view — CRM kanban only */}
      {view === "pipeline" && (
        hasLeads ? (
          <div data-tour="pipeline-board" className="min-h-0 flex-1">
            <PipelineView
              leads={board!.leads}
              onOpen={openInfo}
              onMoveStage={onMoveStage}
              onDraft={onDraft}
            />
          </div>
        ) : (
          <div data-tour="pipeline-board" className="min-h-0 flex-1">
            <EmptyState onLoadDemo={loadDemo} running={running} />
          </div>
        )
      )}

      {/* All leads — table / cards / map */}
      {view === "leads" && (
        hasLeads ? (
          <div data-tour="leads-table" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="grid shrink-0 grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <p className="text-xs uppercase tracking-widest text-mist-500">
                <span className="font-semibold text-mist-200">{board!.leads.length}</span> lead
                {board!.leads.length === 1 ? "" : "s"} · table, cards, or map
              </p>
              <div className="glass inline-flex items-center justify-self-start rounded-full p-1 text-sm sm:justify-self-center">
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
              <div className="hidden sm:block" aria-hidden />
            </div>
            <div
              className={`min-h-0 flex-1 ${
                layout === "map" ? "overflow-hidden" : "overflow-y-auto overscroll-contain"
              }`}
            >
              {layout === "map" ? (
                <LeadMap
                  leads={board!.leads}
                  locationHint={board!.run?.location ?? null}
                  onOpen={openInfo}
                />
              ) : layout === "cards" ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {board!.leads.map((lead, i) => (
                    <LeadCard key={lead.id} lead={lead} index={i} onOpen={() => openInfo(lead.id)} />
                  ))}
                </div>
              ) : (
                <LeadTable leads={board!.leads} onOpen={openInfo} />
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <EmptyState onLoadDemo={loadDemo} running={running} />
          </div>
        )
      )}

      {/* Outreach queue — draft / approve / send */}
      {view === "outreach" && (
        hasLeads ? (
          <div className="min-h-0 flex-1">
            <OutreachView
              leads={board!.leads}
              canSendEmail={!!board!.capabilities.canSendEmail}
              busyId={outreachBusy}
              onOpenInfo={openInfo}
              onOpenDraft={openDraft}
              onDraft={async (id) => {
                setOutreachBusy(id);
                try {
                  await onDraft(id);
                } finally {
                  setOutreachBusy(null);
                }
              }}
              onDecide={async (outreachId, decision) => {
                setOutreachBusy(outreachId);
                try {
                  await onDecide(outreachId, decision);
                } finally {
                  setOutreachBusy(null);
                }
              }}
              onSend={async (outreachId) => {
                requestSend(outreachId);
              }}
              onDraftAll={onDraftAllOutreach}
              onApproveAll={onApproveAllOutreach}
            />
          </div>
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
          mode={drawerMode}
          capabilities={board.capabilities}
          onClose={() => setSelectedId(null)}
          onDraft={onDraft}
          onSaveDraft={onSaveDraft}
          onDecide={onDecide}
          onSend={async (id) => requestSend(id)}
          onSetDelivery={onSetDelivery}
          onUpdateCrm={onUpdateLeadCrm}
        />
      )}

      {pendingSendId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={() => setPendingSendId(null)}
          />
          <div className="animate-float-up relative w-full max-w-md rounded-xl2 border border-white/10 bg-ink-900 p-6 shadow-2xl">
            <p className="font-display text-xl font-semibold text-mist-100">Simulate send?</p>
            <p className="mt-2 text-sm text-mist-300">
              No email provider is configured yet, so this won&apos;t leave the app. Add your
              provider key under Settings → Sending for real inbox delivery — or continue to
              simulate.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <a
                href="/app/settings"
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5"
              >
                Open Settings
              </a>
              <button
                type="button"
                onClick={() => setPendingSendId(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-mist-400 hover:text-mist-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSimulateSend()}
                className="rounded-full bg-aurora-400 px-4 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.03]"
              >
                Simulate send
              </button>
            </div>
          </div>
        </div>
      )}

      {warmupWarn && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={() => setWarmupWarn(null)}
          />
          <div className="animate-float-up relative w-full max-w-md rounded-xl2 border border-amber-400/20 bg-ink-900 p-6 shadow-2xl">
            <p className="font-display text-xl font-semibold text-mist-100">
              Soft warmup recommend
            </p>
            <p className="mt-2 text-sm text-mist-300">
              You&apos;ve sent{" "}
              <span className="text-mist-100">{warmupWarn.todayCount}</span> today. For a
              newer sender we recommend staying around{" "}
              <span className="text-mist-100">{warmupWarn.softCap}</span>/day so inbox
              placement stays healthier. You can ignore this and send anyway.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setWarmupWarn(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-mist-400 hover:text-mist-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmWarmupSend()}
                className="rounded-full bg-aurora-400 px-4 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.03]"
              >
                Send anyway
              </button>
            </div>
          </div>
        </div>
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

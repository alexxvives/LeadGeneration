"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, QuotaExceededError, type BoardResponse, type FirecrawlUsage, type ZeruhUsage } from "@/lib/client-api";
import type { ContactMethod, CrmStage, LeadWithOutreach, PlanId } from "@/lib/types";
import { SearchPanel, type SearchValues } from "./SearchPanel";
import { LeadCard } from "./LeadCard";
import { LeadTable } from "./LeadTable";
import { LeadMap } from "./LeadMap";
import { LeadDrawer } from "./LeadDrawer";
import { UpgradeModal, UsageBar } from "./UpgradeModal";
import { FirecrawlUsageBadge } from "./FirecrawlUsageBadge";
import { ZeruhUsageBadge } from "./ZeruhUsageBadge";
import { Spinner } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { ExportButton } from "./ExportButton";
import { PipelineView } from "./PipelineView";
import { OutreachView } from "./OutreachView";
import { RunsView } from "./RunsView";
import { ImportLeadsPanel } from "./ImportLeadsPanel";
import { LayoutToggle, EmptyState, SearchProgress } from "./StudioHelpers";
import { recordWarmupSend, warmupStatus } from "@/lib/email/warmup";
import {
  draftFlagsFromProfile,
  getDefaultOffer,
  loadSenderProfile,
  resolveSignature,
  subjectForLang,
} from "@/lib/sender-profile";
import { outreachLangFromLocation } from "@/lib/outreach/locale";
import { BoardAssignModal, type BoardDestination } from "./BoardAssignModal";
import { DashboardView } from "./DashboardView";
import { BoardsView } from "./BoardsView";
import { loadStoredBoardFilter, storeBoardFilter } from "./BoardPicker";
import { LeadColumnsMenu } from "./LeadColumnsMenu";
import type { BoardSummary, ImportLeadRow } from "@/lib/types";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type UpgradePrompt = { kind: "leads" | "sends"; planId: PlanId };
type StudioView =
  | "board"
  | "pipeline"
  | "leads"
  | "outreach"
  | "runs"
  | "dashboard"
  | "boards";

function viewFromParams(view: string | null): StudioView {
  if (view === "pipeline") return "pipeline";
  if (view === "leads") return "leads";
  if (view === "outreach") return "outreach";
  if (view === "runs") return "runs";
  if (view === "dashboard") return "dashboard";
  if (view === "boards") return "boards";
  return "board";
}

function queryForView(next: StudioView, boardId?: string | null): string {
  const params = new URLSearchParams();
  if (next === "pipeline") params.set("view", "pipeline");
  else if (next === "leads") params.set("view", "leads");
  else if (next === "outreach") params.set("view", "outreach");
  else if (next === "runs") params.set("view", "runs");
  else if (next === "dashboard") params.set("view", "dashboard");
  else if (next === "boards") params.set("view", "boards");
  if (boardId && boardId !== "all") params.set("board", boardId);
  const q = params.toString();
  return q ? `?${q}` : "";
}

// ─── Studio root ─────────────────────────────────────────────────────────────

export function Studio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = viewFromParams(searchParams.get("view"));
  const boardParam = searchParams.get("board");
  // Prefer URL; if nav omitted `board`, keep the stored sidebar selection.
  const filterBoardId = (() => {
    if (boardParam === "all") return null;
    if (boardParam) return boardParam;
    if (typeof window === "undefined") return null;
    const stored = loadStoredBoardFilter();
    return !stored || stored === "all" ? null : stored;
  })();

  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<"info" | "draft">("info");
  const [layout, setLayout] = useState<"table" | "cards" | "map">("table");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [upgrade, setUpgrade] = useState<UpgradePrompt | null>(null);
  const [fcUsageKey, setFcUsageKey] = useState(0);
  const [fcBefore, setFcBefore] = useState<FirecrawlUsage | null>(null);
  const [zeruhUsageKey, setZeruhUsageKey] = useState(0);
  const [zeruhBefore, setZeruhBefore] = useState<ZeruhUsage | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [outreachBusy, setOutreachBusy] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  /** True while send is in flight and Zeruh verify is configured. */
  const [sendVerifying, setSendVerifying] = useState(false);
  const [pendingSendId, setPendingSendId] = useState<string | null>(null);
  const [warmupWarn, setWarmupWarn] = useState<{
    outreachId: string;
    todayCount: number;
    softCap: number;
  } | null>(null);
  const [pendingSearch, setPendingSearch] = useState<SearchValues | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportLeadRow[] | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<"search" | "import">("search");
  const [boardCreateReq, setBoardCreateReq] = useState(0);
  const activeRunIdRef = useRef<string | null>(null);
  const filterBoardIdRef = useRef<string | null>(filterBoardId);
  filterBoardIdRef.current = filterBoardId;

  const setView = useCallback(
    (next: StudioView) => {
      const stored = loadStoredBoardFilter();
      const bid = stored === "all" ? null : stored;
      router.replace(`/app${queryForView(next, bid)}`, { scroll: false });
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
    const data = await api.board(filterBoardIdRef.current);
    setBoards(data.boards ?? []);
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

  // Re-fetch when sidebar board filter changes.
  useEffect(() => {
    if (boardParam) storeBoardFilter(boardParam);
    void refresh().catch((e) => toast("err", e.message));
  }, [filterBoardId, boardParam, refresh, toast]);

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

  const executeSearch = async (v: SearchValues, boardId: string) => {
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
        subjectTemplate: v.subjectTemplate.trim() || undefined,
        autoDraft: v.autoDraft,
        staticBody: v.staticBody,
        aiPersonalize: v.aiPersonalize,
        maxLeads: v.maxLeads,
        boardId,
      });
      storeBoardFilter(boardId);
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

  const requestSearch = (v: SearchValues) => {
    setPendingSearch(v);
    setPendingImport(null);
    setAssignMode("search");
    setAssignOpen(true);
  };

  const loadDemo = async () => {
    setRunning(true);
    activeRunIdRef.current = null;
    setActiveRunId(null);
    try {
      const def = boards.find((b) => b.isDefault)?.id ?? boards[0]?.id;
      await api.createRun({
        niche: "boutique dental clinics",
        location: "Austin, TX",
        offerNotes:
          "We build booking sites that turn website visitors into scheduled appointments.",
        demo: true,
        boardId: def,
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

  const executeImport = async (leads: ImportLeadRow[], dest: BoardDestination) => {
    const CHUNK = 40;
    const total = leads.length;
    let runId: string | undefined;
    let boardIdOut: string | undefined;
    let imported = 0;
    let merged = 0;
    let skipped = 0;

    setImportProgress({ done: 0, total });
    try {
      for (let i = 0; i < leads.length; i += CHUNK) {
        const chunk = leads.slice(i, i + CHUNK);
        const isLast = i + CHUNK >= leads.length;
        const res = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leads: chunk,
            boardId: dest.boardId,
            newBoardName: dest.newBoardName,
            runId: runId ?? null,
            finalize: isLast,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          imported?: number;
          merged?: number;
          skipped?: number;
          run?: { id: string };
          boardId?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Import failed");
        runId = data.run?.id ?? runId;
        boardIdOut = data.boardId ?? boardIdOut;
        imported += data.imported ?? 0;
        merged += data.merged ?? 0;
        skipped += data.skipped ?? 0;
        setImportProgress({ done: Math.min(i + chunk.length, total), total });
      }
      if (boardIdOut) storeBoardFilter(boardIdOut);
      const parts = [
        imported ? `Added ${imported} new` : null,
        merged
          ? `updated ${merged} existing (same email or website)`
          : null,
        skipped ? `skipped ${skipped} unchanged` : null,
      ].filter(Boolean);
      toast(
        "ok",
        parts.length
          ? `${parts.join(" · ")}.`
          : "Import finished — no changes.",
      );
      activeRunIdRef.current = runId ?? null;
      setActiveRunId(runId ?? null);
      await refresh();
      setView("leads");
    } finally {
      setImportProgress(null);
    }
  };

  const onAssignConfirm = async (dest: BoardDestination) => {
    setAssignOpen(false);
    if (assignMode === "search" && pendingSearch) {
      const v = pendingSearch;
      setPendingSearch(null);
      await executeSearch(v, dest.boardId);
    } else if (assignMode === "import" && pendingImport) {
      const rows = pendingImport;
      setPendingImport(null);
      try {
        await executeImport(rows, dest);
      } catch (e) {
        handleError(e);
      }
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
      const lead = board?.leads.find((l) => l.id === leadId);
      const lang = outreachLangFromLocation(lead?.location ?? null);
      const flags = draftFlagsFromProfile(profile);
      const { outreach } = await api.draft(leadId, {
        signOff: resolveSignature(profile),
        offerNotes: getDefaultOffer(profile) || undefined,
        subjectTemplate: subjectForLang(profile, lang) || undefined,
        staticBody: flags.staticBody,
        aiPersonalize: flags.aiPersonalize,
      });
      patchLeadLocal(leadId, { outreach, status: "queued" });
      toast("ok", "Draft written. Review before approving.");
    } catch (e) {
      toast("err", (e as Error).message);
    }
  };

  const onMarkContacted = async (leadId: string, method: ContactMethod) => {
    setOutreachBusy(leadId);
    try {
      await onMoveStage(leadId, "contacted", method);
      toast(
        "ok",
        method === "phone"
          ? "Logged as called — moved to Contacted."
          : "Logged contact form — moved to Contacted.",
      );
    } finally {
      setOutreachBusy(null);
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
    const verifyOn = Boolean(board?.capabilities.emailVerify);
    let before: ZeruhUsage | null = null;
    if (verifyOn) {
      try {
        before = await api.zeruhUsage();
        setZeruhBefore(before);
      } catch {
        setZeruhBefore(null);
      }
    }
    try {
      const result = await api.send(outreachId);
      recordWarmupSend();
      await refresh();
      if (verifyOn) setZeruhUsageKey((k) => k + 1);
      toast(
        "ok",
        result.provider === "demo"
          ? "Sent (simulated — not delivered)."
          : "Email sent.",
      );
    } catch (e) {
      await refresh();
      if (verifyOn) setZeruhUsageKey((k) => k + 1);
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
    setSendVerifying(Boolean(board?.capabilities.emailVerify));
    try {
      await onSend(outreachId);
    } finally {
      setOutreachBusy(null);
      setSendVerifying(false);
    }
  };

  /** Real delivery needs a provider; otherwise confirm simulate-or-settings. Soft warmup warn if over recommend. */
  const requestSend = async (outreachId: string) => {
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
    await runSend(outreachId);
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

  /** Send every approved draft (still one human approve each — constitution Art. I.1). */
  const onSendAllOutreach = async () => {
    if (!board) return;
    const targets = board.leads.filter(
      (l) =>
        l.outreach?.status === "approved" &&
        (l.outreach.toEmail || l.emails[0]),
    );
    if (targets.length === 0) return;

    if (!board.capabilities.canSendEmail) {
      toast(
        "err",
        "Add a sending key in Settings before Send all — or send one at a time to simulate.",
      );
      return;
    }

    const status = warmupStatus();
    if (status.overSoftCap) {
      const ok = confirm(
        `Soft warmup recommend is ${status.softCap}/day (you've sent ${status.todayCount}). Send all ${targets.length} anyway?`,
      );
      if (!ok) return;
    } else {
      const ok = confirm(
        `Send ${targets.length} approved email${targets.length === 1 ? "" : "s"} now?`,
      );
      if (!ok) return;
    }

    setOutreachBusy("send-all");
    setSendVerifying(Boolean(board.capabilities.emailVerify));
    let sent = 0;
    let failed = 0;
    try {
      for (const l of targets) {
        if (!l.outreach) continue;
        try {
          await api.send(l.outreach.id);
          recordWarmupSend();
          sent += 1;
        } catch {
          failed += 1;
        }
      }
      await refresh();
      if (board.capabilities.emailVerify) setZeruhUsageKey((k) => k + 1);
      if (sent > 0) {
        toast(
          "ok",
          `Sent ${sent}${failed ? ` · ${failed} failed` : ""}.`,
        );
      } else if (failed > 0) {
        toast("err", `Could not send ${failed} email${failed === 1 ? "" : "s"}.`);
      }
    } finally {
      setOutreachBusy(null);
      setSendVerifying(false);
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

  const onDeleteLead = async (leadId: string) => {
    setBoard((b) =>
      b ? { ...b, leads: b.leads.filter((l) => l.id !== leadId) } : b,
    );
    try {
      await api.deleteLead(leadId);
      toast("ok", "Lead deleted.");
    } catch (e) {
      await refresh();
      toast("err", (e as Error).message);
    }
  };

  const onDeleteLeads = async (leadIds: string[]) => {
    const idSet = new Set(leadIds);
    setBoard((b) =>
      b ? { ...b, leads: b.leads.filter((l) => !idSet.has(l.id)) } : b,
    );
    let failed = 0;
    for (const id of leadIds) {
      try {
        await api.deleteLead(id);
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      await refresh();
      toast(
        "err",
        `Deleted ${leadIds.length - failed}; ${failed} failed — refreshed.`,
      );
    } else {
      toast(
        "ok",
        `Deleted ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}.`,
      );
    }
  };

  return (
    <main
      className={
        lockViewport
          ? "mx-auto flex h-dvh max-w-7xl flex-col overflow-hidden px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pt-8"
          : "mx-auto flex min-h-dvh max-w-7xl flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pt-8"
      }
    >
      <div className="mb-5 grid shrink-0 grid-cols-1 items-end gap-3 sm:mb-6 sm:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {view === "dashboard"
                ? "Dashboard"
                : view === "boards"
                  ? "Boards"
                  : view === "pipeline"
                    ? "Pipeline"
                    : view === "leads"
                      ? "Leads"
                      : view === "outreach"
                        ? "Outreach"
                        : view === "runs"
                          ? "Search runs"
                          : "Search"}
            </h1>
            {view === "boards" ? (
              <button
                type="button"
                onClick={() => setBoardCreateReq((n) => n + 1)}
                className="rounded-full bg-aurora-400 px-4 py-1.5 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.02]"
              >
                Create board
              </button>
            ) : null}
            {view === "leads" && hasLeads ? <ExportButton /> : null}
          </div>
          {view === "runs" || view === "board" || view === "boards" ? (
            <p className="mt-1 text-sm text-mist-500">
              {view === "runs"
                ? "History of searches in this workspace."
                : view === "boards"
                  ? "Named lists for campaigns or niches."
                  : "Find prospects by niche and location."}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-center">
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-center">
            {view === "board" && board?.capabilities.firecrawl ? (
              <FirecrawlUsageBadge refreshKey={fcUsageKey} before={fcBefore} />
            ) : null}
            {board?.capabilities.emailVerify ? (
              <ZeruhUsageBadge refreshKey={zeruhUsageKey} before={zeruhBefore} />
            ) : null}
          </div>
          {sendVerifying ? (
            <p className="flex items-center gap-2 text-xs text-amber-200/90">
              <Spinner className="h-3 w-3" />
              Verifying email is deliverable…
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-start gap-3 sm:justify-end">
          {view === "dashboard" ? (
            <label className="inline-flex items-center">
              <span className="sr-only">Filter by board</span>
              <select
                value={filterBoardId ?? "all"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "all") {
                    storeBoardFilter("all");
                    router.replace("/app?view=dashboard", { scroll: false });
                  } else {
                    storeBoardFilter(v);
                    router.replace(`/app?view=dashboard&board=${v}`, {
                      scroll: false,
                    });
                  }
                }}
                className="select-glass glass rounded-xl border border-white/10 py-2 pl-4 text-sm font-medium text-mist-100 outline-none transition-colors hover:border-white/20 focus:border-aurora-400/50"
              >
                <option value="all">All boards</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.isDefault ? " (Default)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {view !== "dashboard" && view !== "boards" && board?.workspace && (
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
        </div>
      </div>

      {/* Dashboard */}
      {view === "dashboard" && (
        <DashboardView boardFilterId={filterBoardId} boards={boards} />
      )}

      {/* Boards management */}
      {view === "boards" && (
        <BoardsView
          createRequestId={boardCreateReq}
          onSelectBoard={(id) => {
            storeBoardFilter(id);
            router.replace(`/app?view=pipeline&board=${id}`, { scroll: false });
          }}
        />
      )}

      {/* Search view — always show the full panel */}
      {view === "board" && (
        <div className="mb-8">
          <SearchPanel
            onSearch={requestSearch}
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
          {!canSearchLive && !running && (
            <p className="mt-3 text-xs text-mist-500">
              No Firecrawl/Exa key — live search is unavailable. Add a key in Settings, or
              import leads below.
            </p>
          )}
          {!running && (
            <ImportLeadsPanel
              onPickFile={async (leads) => {
                setPendingImport(leads);
                setPendingSearch(null);
                setAssignMode("import");
                setAssignOpen(true);
              }}
            />
          )}
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
              <div className="flex justify-start sm:justify-end">
                {layout === "table" ? <LeadColumnsMenu /> : null}
              </div>
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
                <LeadTable
                  leads={board!.leads}
                  onOpen={openInfo}
                  onMoveStage={onMoveStage}
                  onUpdateLead={onUpdateLeadCrm}
                  onDeleteLead={(id) => void onDeleteLead(id)}
                  onDeleteLeads={onDeleteLeads}
                />
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
              emailVerify={!!board!.capabilities.emailVerify}
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
                await requestSend(outreachId);
              }}
              onDraftAll={onDraftAllOutreach}
              onApproveAll={onApproveAllOutreach}
              onSendAll={onSendAllOutreach}
              onMarkContacted={onMarkContacted}
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

      {importProgress && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" />
          <div className="animate-float-up relative w-full max-w-sm rounded-xl2 border border-aurora-400/20 bg-ink-900 p-6 shadow-2xl">
            <p className="font-display text-lg font-semibold text-mist-100">
              Importing leads…
            </p>
            <p className="mt-2 text-sm text-mist-300">
              <span className="tabular-nums text-mist-100">
                {importProgress.done}
              </span>
              {" / "}
              <span className="tabular-nums">{importProgress.total}</span> rows
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink-950/60">
              <div
                className="h-full rounded-full bg-aurora-400 transition-[width] duration-300 ease-out"
                style={{
                  width: `${
                    importProgress.total
                      ? Math.round(
                          (importProgress.done / importProgress.total) * 100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-mist-500">
              <Spinner className="h-3.5 w-3.5 text-aurora-300" />
              Then we&apos;ll open the Leads table.
            </p>
          </div>
        </div>
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

      <BoardAssignModal
        open={assignOpen}
        title={assignMode === "search" ? "Save leads to which board?" : "Import to which board?"}
        subtitle={
          assignMode === "search"
            ? "Search results will be added to the board you pick."
            : "Imported rows land on this board. Rows matching an existing email or website update that lead instead of creating a duplicate."
        }
        boards={boards.length ? boards : board?.boards ?? []}
        preferredBoardId={filterBoardId}
        confirmLabel={assignMode === "search" ? "Find leads" : "Import"}
        onConfirm={onAssignConfirm}
        onClose={() => {
          setAssignOpen(false);
          setPendingSearch(null);
          setPendingImport(null);
        }}
      />

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

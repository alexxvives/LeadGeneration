"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  api,
  QuotaExceededError,
  RateLimitedError,
  type BoardResponse,
} from "@/lib/client-api";
import type { ContactMethod, CrmStage, LeadWithOutreach, PlanId } from "@/lib/types";
import { SearchPanel, type SearchValues } from "./SearchPanel";
import { LeadCard } from "./LeadCard";
import { LeadTable } from "./LeadTable";
import { LeadMap } from "./LeadMap";
import { LeadDrawer } from "./LeadDrawer";
import { UpgradeModal, UsageBar } from "./UpgradeModal";
import { VerifyLimitModal } from "./VerifyLimitModal";
import { crmStageLabel } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { ExportButton } from "./ExportButton";
import { PipelineView } from "./PipelineView";
import { OutreachView } from "./OutreachView";
import { RunsView } from "./RunsView";
import { ImportLeadsPanel } from "./ImportLeadsPanel";
import { LayoutToggle, EmptyState, SearchProgress } from "./StudioHelpers";
import { StudioViewSkeleton, LeadsLayoutSkeleton, useDeferredLoading } from "./skeletons";
import { recordWarmupSend, warmupStatus } from "@/lib/email/warmup";
import {
  draftFlagsFromProfile,
  hydrateOutreachProfilesFromServer,
  loadSenderProfile,
  pitchForLang,
  resolveDraftLang,
  resolveSignature,
  subjectForLang,
} from "@/lib/sender-profile";
import { BoardAssignModal, type BoardDestination } from "./BoardAssignModal";
import { DashboardView } from "./DashboardView";
import { AdminPlatformView } from "./AdminPlatformView";
import { AdminUsersView } from "./AdminUsersView";
import { BoardsView } from "./BoardsView";
import { loadStoredBoardFilter, storeBoardFilter } from "./BoardPicker";
import { BOARD_REFRESH_EVENT } from "./GettingStartedWizard";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import type { BoardSummary, ImportLeadRow } from "@/lib/types";

const CRM_STAGE_FILTERS: CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
];

type Toast = { id: number; kind: "ok" | "err"; text: string };
type UpgradePrompt = { kind: "leads" | "sends"; planId: PlanId };
type StudioView =
  | "board"
  | "pipeline"
  | "leads"
  | "outreach"
  | "runs"
  | "dashboard"
  | "boards"
  | "admin"
  | "admin-users";

function viewFromParams(view: string | null): StudioView {
  if (view === "pipeline") return "pipeline";
  if (view === "leads") return "leads";
  if (view === "outreach") return "outreach";
  if (view === "runs") return "runs";
  if (view === "dashboard") return "dashboard";
  if (view === "boards") return "boards";
  if (view === "admin") return "admin";
  if (view === "admin-users") return "admin-users";
  return "board";
}

/** Keep last leads for inactive panes so filter updates don’t re-render all layouts. */
function useActiveLeads(
  active: boolean,
  leads: LeadWithOutreach[],
): LeadWithOutreach[] {
  const ref = useRef(leads);
  if (active) ref.current = leads;
  return ref.current;
}

function queryForView(next: StudioView, boardId?: string | null): string {
  const params = new URLSearchParams();
  if (next === "pipeline") params.set("view", "pipeline");
  else if (next === "leads") params.set("view", "leads");
  else if (next === "outreach") params.set("view", "outreach");
  else if (next === "runs") params.set("view", "runs");
  else if (next === "dashboard") params.set("view", "dashboard");
  else if (next === "boards") params.set("view", "boards");
  else if (next === "admin") params.set("view", "admin");
  else if (next === "admin-users") params.set("view", "admin-users");
  if (boardId && boardId !== "all") params.set("board", boardId);
  const q = params.toString();
  return q ? `?${q}` : "";
}

// ─── Studio root ─────────────────────────────────────────────────────────────

export function Studio() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.isAdmin === true;
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const view = viewFromParams(rawView);
  const boardParam = searchParams.get("board");

  // Admins land on platform dashboard — not Search / Pipeline / etc.
  useEffect(() => {
    if (!isAdmin) return;
    if (view === "admin" || view === "admin-users") return;
    router.replace("/app?view=admin", { scroll: false });
  }, [isAdmin, view, router]);
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
  const hasLoadedRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<"info" | "draft">("info");
  const [drawerPromptNote, setDrawerPromptNote] = useState(false);
  const [layout, setLayout] = useState<"table" | "cards" | "map">("table");
  /** Keep each layout mounted after first visit so switching stays instant. */
  const [visitedLayouts, setVisitedLayouts] = useState<Set<"table" | "cards" | "map">>(
    () => new Set(["table"]),
  );
  const [pipelineFilter, setPipelineFilter] = useState<CrmStage | "all">("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [editLocked, setEditLocked] = useState(false);
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [upgrade, setUpgrade] = useState<UpgradePrompt | null>(null);
  const [verifyLimitPlan, setVerifyLimitPlan] = useState<PlanId | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [outreachBusy, setOutreachBusy] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{
    /** Smooth display value (may lead confirmed slightly). */
    done: number;
    total: number;
  } | null>(null);
  const [deletingLeads, setDeletingLeads] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const importRunIdRef = useRef<string | null>(null);
  const importConfirmedRef = useRef(0);
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
  const verifyLimitShownRef = useRef(false);
  const filterBoardIdRef = useRef<string | null>(filterBoardId);
  filterBoardIdRef.current = filterBoardId;
  const viewRef = useRef(view);
  viewRef.current = view;
  const boardLiteRef = useRef(false);

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
        if (e.kind === "verifies") setVerifyLimitPlan(e.planId);
        else setUpgrade({ kind: e.kind, planId: e.planId });
      } else {
        toast("err", (e as Error).message);
      }
    },
    [toast],
  );

  const refresh = useCallback(async (opts?: { forceFull?: boolean }) => {
    const v = viewRef.current;
    const lite =
      !opts?.forceFull &&
      (v === "dashboard" ||
        v === "boards" ||
        v === "admin" ||
        v === "admin-users");
    const data = await api.board(filterBoardIdRef.current, { lite });
    boardLiteRef.current = lite;
    setBoards(data.boards ?? []);
    const pinned = activeRunIdRef.current;
    if (!lite && pinned && pinned !== data.run?.id) {
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

  // Hydrate drafting profiles from the workspace (localStorage write-through).
  useEffect(() => {
    void hydrateOutreachProfilesFromServer();
  }, []);

  // Initial load + re-fetch when sidebar board filter changes (single effect).
  // Soft-refresh after first paint so adding `?board=` mid-tour doesn't flash
  // the full-page spinner (that looked like a double render).
  useEffect(() => {
    if (boardParam) storeBoardFilter(boardParam);
    const first = !hasLoadedRef.current;
    if (first) setLoading(true);
    void refresh()
      .then(() => {
        hasLoadedRef.current = true;
      })
      .catch((e) => toast("err", e.message))
      .finally(() => {
        if (first) setLoading(false);
      });
  }, [filterBoardId, boardParam, refresh, toast]);

  // Leaving dashboard/boards/admin → reload full lead payload for pipeline/etc.
  useEffect(() => {
    const needsLeads =
      view === "pipeline" ||
      view === "leads" ||
      view === "outreach" ||
      view === "board" ||
      view === "runs";
    if (!needsLeads || !boardLiteRef.current) return;
    void refresh({ forceFull: true }).catch(() => {});
  }, [view, refresh]);

  // Pipeline: pick up webhook reply → In Conversation without a manual refresh.
  useEffect(() => {
    if (view !== "pipeline") return;
    const id = window.setInterval(() => {
      void refresh().catch(() => {});
    }, 15_000);
    return () => window.clearInterval(id);
  }, [view, refresh]);

  // Soft lock heartbeat when a specific board is selected.
  useEffect(() => {
    const bid = filterBoardId;
    if (!bid) {
      setEditLocked(false);
      setLockHolder(null);
      return;
    }
    // Wait for board list so we don't heartbeat a stale id from another session.
    if (boards.length === 0) return;
    if (!boards.some((b) => b.id === bid)) {
      storeBoardFilter("all");
      setEditLocked(false);
      setLockHolder(null);
      return;
    }
    let cancelled = false;
    const beat = async () => {
      try {
        await api.heartbeatBoardLock(bid);
        if (!cancelled) {
          setEditLocked(false);
          setLockHolder(null);
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        const notFound = /not found/i.test(msg);
        if (notFound) {
          storeBoardFilter("all");
          setEditLocked(false);
          setLockHolder(null);
          router.replace(`/app${queryForView(view, null)}`, { scroll: false });
          return;
        }
        const locked =
          (e as Error & { locked?: boolean }).locked ||
          /working on this board|paused/i.test(msg);
        if (locked) {
          setEditLocked(true);
          setLockHolder(
            msg.split(" is working")[0] ||
              board?.boardLock?.userName ||
              "Someone else",
          );
        }
      }
    };
    void beat();
    const id = window.setInterval(() => void beat(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      void api.releaseBoardLock(bid).catch(() => undefined);
    };
  }, [filterBoardId, boards, board?.boardLock, router, view]);

  useEffect(() => {
    const lock = board?.boardLock;
    if (lock) {
      setEditLocked(true);
      setLockHolder(lock.userName ?? "Someone else");
    }
  }, [board?.boardLock]);

  // Daily verify cap hit → warn once until usage resets.
  useEffect(() => {
    const ws = board?.workspace;
    if (!ws || !board?.capabilities.emailVerify || ws.emailVerifyEnabled === false) {
      return;
    }
    if (ws.verifiesLimit > 0 && ws.verifiesUsed >= ws.verifiesLimit) {
      if (!verifyLimitShownRef.current) {
        verifyLimitShownRef.current = true;
        setVerifyLimitPlan(ws.planId);
      }
    } else {
      verifyLimitShownRef.current = false;
    }
  }, [
    board?.capabilities.emailVerify,
    board?.workspace,
  ]);

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
    try {
      activeRunIdRef.current = null;
      setActiveRunId(null);
      await api.createRun({
        niche: v.niche,
        location: v.location,
        senderName: v.senderName,
        offerNotes: v.offerNotes.trim() || undefined,
        subjectTemplate: v.subjectTemplate.trim() || undefined,
        autoDraft: v.autoDraft,
        staticBody: v.staticBody,
        aiPersonalize: v.aiPersonalize,
        searchStrategy: v.searchStrategy,
        maxLeads: v.maxLeads,
        boardId,
      });
      storeBoardFilter(boardId);
      const data = await refresh();
      const n = data.leads.length;
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

  // Tour (and other chrome) can seed/refresh the board without a full remount.
  useEffect(() => {
    const onRefresh = () => {
      void refresh().catch(() => undefined);
    };
    window.addEventListener(BOARD_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(BOARD_REFRESH_EVENT, onRefresh);
  }, [refresh]);

  const cancelImport = () => {
    const runId = importRunIdRef.current;
    importAbortRef.current?.abort();
    if (runId) {
      void fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: [], runId, cancel: true }),
      }).catch(() => undefined);
    }
  };

  const executeImport = async (leads: ImportLeadRow[], dest: BoardDestination) => {
    // Larger chunks are fine now that import is spreadsheet-only (no HTTP enrich).
    const CHUNK = 250;
    const total = leads.length;
    let runId: string | undefined;
    let boardIdOut: string | undefined;
    let imported = 0;
    let merged = 0;
    let skipped = 0;

    importAbortRef.current?.abort();
    const ac = new AbortController();
    importAbortRef.current = ac;
    importRunIdRef.current = null;
    importConfirmedRef.current = 0;

    setImportProgress({ done: 0, total });

    // Soft progress: ease toward the next chunk ceiling while a request is in flight.
    const softTimer = window.setInterval(() => {
      if (ac.signal.aborted) return;
      setImportProgress((p) => {
        if (!p || p.total <= 0) return p;
        const confirmed = importConfirmedRef.current;
        const softCap = Math.min(
          p.total - (confirmed >= p.total ? 0 : 1),
          confirmed + CHUNK * 0.9,
        );
        if (p.done >= softCap) return p;
        const step = Math.max(0.4, (softCap - p.done) * 0.12);
        return { ...p, done: Math.min(softCap, p.done + step) };
      });
    }, 80);

    try {
      for (let i = 0; i < leads.length; i += CHUNK) {
        if (ac.signal.aborted) throw new Error("Import cancelled");
        const chunk = leads.slice(i, i + CHUNK);
        const isLast = i + CHUNK >= leads.length;
        const profile = loadSenderProfile();
        const pitch = pitchForLang(
          profile,
          resolveDraftLang(profile, null),
        ).trim();
        const res = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leads: chunk,
            boardId: dest.boardId,
            newBoardName: dest.newBoardName,
            runId: runId ?? null,
            finalize: isLast,
            offerNotes: pitch || null,
          }),
          signal: ac.signal,
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
        importRunIdRef.current = runId ?? null;
        boardIdOut = data.boardId ?? boardIdOut;
        imported += data.imported ?? 0;
        merged += data.merged ?? 0;
        skipped += data.skipped ?? 0;
        const confirmed = Math.min(i + chunk.length, total);
        importConfirmedRef.current = confirmed;
        setImportProgress({ done: confirmed, total });
      }
      // Safety finalize if the last data chunk didn't flip status (network blip).
      if (runId && !ac.signal.aborted) {
        try {
          await fetch("/api/leads/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leads: [], runId, finalize: true }),
            signal: ac.signal,
          });
        } catch {
          /* best-effort */
        }
      }
      if (boardIdOut) storeBoardFilter(boardIdOut);
      const parts = [
        imported ? `Added ${imported} new` : null,
        merged
          ? `updated ${merged} already in workspace (same company name)`
          : null,
        skipped
          ? `${skipped} already in workspace — no new fields`
          : null,
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
    } catch (e) {
      if (ac.signal.aborted || (e as Error).name === "AbortError") {
        toast("ok", "Import cancelled.");
        await refresh();
        return;
      }
      throw e;
    } finally {
      window.clearInterval(softTimer);
      if (importAbortRef.current === ac) importAbortRef.current = null;
      importRunIdRef.current = null;
      importConfirmedRef.current = 0;
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

  const onDraft = async (leadId: string): Promise<string | null> => {
    try {
      const profile = loadSenderProfile();
      const lead = board?.leads.find((l) => l.id === leadId);
      const lang = resolveDraftLang(profile, lead?.location ?? null);
      const flags = draftFlagsFromProfile(profile);
      const pitch = pitchForLang(profile, lang).trim();
      const { outreach } = await api.draft(leadId, {
        signOff: resolveSignature(profile),
        // Empty pitch → empty body (no stock opener / default pitch).
        // Always pass offerNotes so we never fall back to stale run.offerNotes.
        offerNotes: pitch || "",
        subjectTemplate: subjectForLang(profile, lang) || undefined,
        staticBody: true,
        aiPersonalize: flags.aiPersonalize,
        forceLang: lang,
      });
      patchLeadLocal(leadId, { outreach, status: "queued" });
      toast("ok", pitch ? "Draft written — ready to contact." : "Empty draft created — add your template in Settings, or edit the body.");
      return outreach.id;
    } catch (e) {
      toast("err", (e as Error).message);
      return null;
    }
  };

  /** Contact Draft: generate from latest profile, then open the composer. */
  const createAndOpenDraft = async (leadId: string) => {
    setOutreachBusy(leadId);
    try {
      const id = await onDraft(leadId);
      if (id) openDraft(leadId);
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

  /** Yellow arrow: approve (create draft first if missing) → Ready. */
  const approveContactDraft = async (leadId: string) => {
    setOutreachBusy(leadId);
    try {
      const lead = board?.leads.find((l) => l.id === leadId);
      let outreachId = lead?.outreach?.id ?? null;
      if (!outreachId) {
        outreachId = await onDraft(leadId);
        if (!outreachId) return;
      }
      await onDecide(outreachId, "approved", { silent: true });
      toast("ok", "Approved — moved to Ready to contact.");
    } finally {
      setOutreachBusy(null);
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
      if (e instanceof QuotaExceededError && e.kind === "verifies") {
        setVerifyLimitPlan(e.planId);
        return;
      }
      const err = e as Error & { undeliverableRemoved?: boolean };
      const msg = err.message;
      if (err.undeliverableRemoved || /isn.?t real|can.?t receive mail|undeliverable/i.test(msg)) {
        toast("err", msg);
      } else if (/must be approved/i.test(msg)) {
        toast("err", "Approve the draft first, then send. (If a prior send failed, re-approve and retry.)");
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
  const requestSend = async (outreachId: string) => {
    // Send click is the per-lead human gate — promote draft → approved first.
    const lead = findLeadByOutreach(outreachId);
    const st = lead?.outreach?.status;
    if (st === "sending") return; // claim already in flight
    if (st === "draft" || st === "rejected" || st === "failed") {
      await onDecide(outreachId, "approved", { silent: true });
    }
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
    contactMethods?: ContactMethod[] | null,
  ) => {
    const patch: {
      crmStage: CrmStage;
      contactMethods?: ContactMethod[];
    } = {
      crmStage: stage,
    };
    if (contactMethods !== undefined) {
      patch.contactMethods = contactMethods ?? [];
    }
    // Moving back to New clears contact methods so cards don’t keep Contacted chrome.
    if (stage === "new" && contactMethods === undefined) {
      patch.contactMethods = [];
    }
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

  const onMarkContacted = async (
    leadId: string,
    method: ContactMethod,
    opts?: { promptNote?: boolean },
  ) => {
    setOutreachBusy(leadId);
    try {
      await onMoveStage(leadId, "contacted", [method]);
      toast(
        "ok",
        method === "phone"
          ? "Logged as called — moved to Contacted."
          : "Logged contact form — moved to Contacted.",
      );
      if (opts?.promptNote) {
        setDrawerPromptNote(true);
        setDrawerMode("info");
        setSelectedId(leadId);
      }
    } finally {
      setOutreachBusy(null);
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

  /** Send every approved outreach in Ready (Send click = per-lead gate — Art. I.1). */
  const onSendAllOutreach = async () => {
    if (!board) return;
    const targets = board.leads.filter((l) => {
      const s = l.outreach?.status;
      return (
        (s === "approved" || s === "failed") &&
        (l.outreach?.toEmail || l.emails[0])
      );
    });
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
        `Send ${targets.length} email${targets.length === 1 ? "" : "s"} now?`,
      );
      if (!ok) return;
    }

    setOutreachBusy("send-all");
    let sent = 0;
    let failed = 0;
    let hitVerifyLimit = false;
    try {
      for (let i = 0; i < targets.length; i++) {
        const l = targets[i]!;
        if (!l.outreach) continue;
        let attempts = 0;
        for (;;) {
          try {
            if (l.outreach.status !== "approved") {
              await onDecide(l.outreach.id, "approved", { silent: true });
            }
            await api.send(l.outreach.id);
            recordWarmupSend();
            sent += 1;
            break;
          } catch (e) {
            if (e instanceof QuotaExceededError && e.kind === "verifies") {
              hitVerifyLimit = true;
              setVerifyLimitPlan(e.planId);
              break;
            }
            if (e instanceof RateLimitedError && attempts < 8) {
              attempts += 1;
              toast(
                "ok",
                `Pausing for rate limit… ${sent} of ${targets.length} sent`,
              );
              await new Promise((r) => setTimeout(r, e.retryAfterMs));
              continue;
            }
            failed += 1;
            break;
          }
        }
        if (hitVerifyLimit) break;
      }
      await refresh();
      if (sent > 0) {
        toast(
          "ok",
          `Sent ${sent}${failed ? ` · ${failed} failed` : ""}.`,
        );
      } else if (failed > 0 && !hitVerifyLimit) {
        toast("err", `Could not send ${failed} email${failed === 1 ? "" : "s"}.`);
      }
    } finally {
      setOutreachBusy(null);
    }
  };

  const openInfo = (id: string) => {
    setDrawerPromptNote(false);
    setDrawerMode("info");
    setSelectedId(id);
  };
  const openDraft = (id: string) => {
    setDrawerPromptNote(false);
    setDrawerMode("draft");
    setSelectedId(id);
  };

  const selected = board?.leads.find((l) => l.id === selectedId) ?? null;

  /** Accent-fold + every token must appear (company, email, location, …). */
  const leadMatchesSearch = useCallback((l: LeadWithOutreach, raw: string) => {
    const q = raw.trim();
    if (!q) return true;
    const fold = (s: string) =>
      s
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase();
    const tokens = fold(q).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const hay = fold(
      [
        l.company,
        l.location,
        l.companyType,
        l.contactName,
        l.aboutBlurb,
        l.notes,
        l.website,
        ...(l.emails ?? []),
        ...(l.phones ?? []),
        ...(l.tags ?? []),
        ...Object.values(l.customFields ?? {}),
        ...(l.followUps ?? []).map((f) => f.note),
      ]
        .filter(Boolean)
        .join(" "),
    );
    return tokens.every((t) => hay.includes(t));
  }, []);

  // Input/select update immediately; heavy filter+render catches up via deferred values.
  const deferredLeadSearch = useDeferredValue(leadSearch);
  const deferredPipelineFilter = useDeferredValue(pipelineFilter);
  const [isLayoutPending, startLayoutTransition] = useTransition();

  const searchFilteredLeads = useMemo(() => {
    const all = board?.leads ?? [];
    return all.filter((l) => leadMatchesSearch(l, deferredLeadSearch));
  }, [board?.leads, deferredLeadSearch, leadMatchesSearch]);

  const filteredLeads = useMemo(() => {
    if (deferredPipelineFilter === "all") return searchFilteredLeads;
    return searchFilteredLeads.filter(
      (l) => (l.crmStage ?? "new") === deferredPipelineFilter,
    );
  }, [searchFilteredLeads, deferredPipelineFilter]);

  const leadsFilterPending =
    leadSearch !== deferredLeadSearch ||
    pipelineFilter !== deferredPipelineFilter ||
    isLayoutPending;
  const showLeadsFilterSkeleton = useDeferredLoading(leadsFilterPending, 100);

  const selectLayout = (next: "table" | "cards" | "map") => {
    startLayoutTransition(() => {
      setVisitedLayouts((prev) => {
        if (prev.has(next)) return prev;
        const copy = new Set(prev);
        copy.add(next);
        return copy;
      });
      setLayout(next);
    });
  };

  const tableLeads = useActiveLeads(layout === "table", filteredLeads);
  const cardsLeads = useActiveLeads(layout === "cards", filteredLeads);
  const mapLeads = useActiveLeads(layout === "map", filteredLeads);

  const showBoardSkeleton = useDeferredLoading(loading);

  if (loading) {
    return showBoardSkeleton ? (
      <StudioViewSkeleton view={view} />
    ) : (
      <div className="h-dvh" aria-hidden />
    );
  }

  const hasLeads = (board?.leads.length ?? 0) > 0;
  const canSearchLive = board?.capabilities.canSearchLive ?? false;
  /** Pipeline / outreach / leads fill the shell; other views scroll inside it. */
  const fillViewport =
    view === "pipeline" || view === "outreach" || view === "leads";
  const showLeadSearch =
    hasLeads &&
    (view === "leads" || view === "pipeline" || view === "outreach");

  const onDeleteLead = async (leadId: string) => {
    // Stop any in-flight CSV import so rows don’t reappear after delete.
    importAbortRef.current?.abort();
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
    const boardLeads = board?.leads ?? [];
    // Full wipe of the filtered board view → one set-based API call (avoids
    // the 500-id cap / huge POST that was 400’ing on production).
    const clearingBoard =
      Boolean(filterBoardId) &&
      boardLeads.length > 0 &&
      leadIds.length >= boardLeads.length &&
      boardLeads.every((l) => idSet.has(l.id));
    importAbortRef.current?.abort();
    setDeletingLeads(true);
    setDeleteProgress({ done: 0, total: leadIds.length });
    // Optimistic — hide rows immediately so large deletes don’t feel stuck.
    setBoard((b) =>
      b
        ? {
            ...b,
            leads: clearingBoard
              ? []
              : b.leads.filter((l) => !idSet.has(l.id)),
          }
        : b,
    );
    setSelectedId((cur) => (cur && idSet.has(cur) ? null : cur));
    try {
      const { deleted } = await api.deleteLeads(leadIds, {
        boardId: filterBoardId,
        clearBoard: clearingBoard,
        onProgress: (done, total) => setDeleteProgress({ done, total }),
      });
      toast(
        "ok",
        `Deleted ${deleted} lead${deleted === 1 ? "" : "s"}.`,
      );
      // Confirm server state (also clears any race from a cancelled import).
      await refresh();
    } catch (e) {
      await refresh();
      toast("err", (e as Error).message);
    } finally {
      setDeletingLeads(false);
      setDeleteProgress(null);
    }
  };

  return (
    <main className="mx-auto flex h-dvh max-w-[90rem] flex-col overflow-hidden px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:px-3 sm:pt-8">
      <div className="mb-5 grid shrink-0 grid-cols-1 items-end gap-3 sm:mb-6 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
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
                          : view === "admin"
                            ? "Dashboard"
                            : view === "admin-users"
                              ? "Users"
                              : "Search"}
            </h1>
            {view === "boards" ? (
              <button
                type="button"
                onClick={() => setBoardCreateReq((n) => n + 1)}
                className="rounded-full bg-aurora-400 px-4 py-1.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02]"
              >
                Create board
              </button>
            ) : null}
            {view === "leads" && hasLeads ? <ExportButton /> : null}
          </div>
          <p className="mt-0.5 text-sm text-mist-500">
            {view === "dashboard"
              ? "Overview of leads and activity across your boards."
              : view === "boards"
                ? "Named lists for campaigns or niches. Invite collaborators; only one person edits at a time."
                : view === "pipeline"
                  ? "Drag leads between stages as conversations progress."
                  : view === "leads"
                    ? "All prospects on this board — filter, edit, and export."
                    : view === "outreach"
                      ? "Draft, approve, and send outreach one lead at a time."
                      : view === "runs"
                        ? "History of searches in this workspace."
                        : view === "admin"
                          ? "Cross-workspace health — workspaces, usage, and billing signals."
                          : view === "admin-users"
                            ? "Plan, usage, and send setup across workspaces."
                            : "Find prospects by niche and location."}
          </p>
          {editLocked && filterBoardId ? (
            <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">
              {lockHolder ?? "Someone else"} is editing this board — view only until they leave.
            </p>
          ) : null}
        </div>

        {!isAdmin &&
        view !== "dashboard" &&
        view !== "boards" &&
        view !== "admin" &&
        view !== "admin-users" &&
        board?.workspace ? (
          <div className="hidden min-w-[16rem] max-w-md flex-col gap-1 justify-self-center sm:flex sm:min-w-[22rem]">
            <div
              className={`grid gap-4 ${
                board.capabilities.emailVerify &&
                board.workspace.emailVerifyEnabled !== false
                  ? "grid-cols-3"
                  : "grid-cols-2"
              }`}
            >
              {board.workspace.planId === "insider" ? (
                <UsageBar
                  label="Leads"
                  title="Firecrawl credits"
                  unavailable={
                    board.workspace.firecrawlCreditsRemaining == null
                  }
                  remaining={
                    board.workspace.firecrawlCreditsRemaining ?? undefined
                  }
                />
              ) : (
                <UsageBar
                  label="Leads"
                  used={board.workspace.leadsUsed}
                  limit={board.workspace.leadsLimit}
                />
              )}
              <UsageBar
                label="Sends"
                used={board.workspace.unlimitedSends ? 0 : board.workspace.sendsUsed}
                limit={
                  board.workspace.unlimitedSends ? 0 : board.workspace.sendsLimit
                }
              />
              {board.capabilities.emailVerify &&
              board.workspace.emailVerifyEnabled !== false ? (
                <UsageBar
                  label="Verifies"
                  used={board.workspace.verifiesUsed}
                  limit={board.workspace.verifiesLimit}
                />
              ) : null}
            </div>
            {!board.workspace.metered && (
              <p className="text-center text-[10px] text-mist-500">
                Local preview — quotas enforced on the live app
              </p>
            )}
          </div>
        ) : (
          <div className="hidden sm:block" aria-hidden />
        )}

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
          {showLeadSearch ? (
            <label className="relative inline-flex w-full max-w-xs items-center sm:w-56">
              <span className="sr-only">Search leads</span>
              <input
                type="search"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Search leads…"
                className="w-full rounded-xl border border-white/10 bg-ink-900/60 py-2 pl-3 pr-3 text-sm text-mist-100 outline-none placeholder:text-mist-600 focus:border-aurora-400/50"
              />
            </label>
          ) : null}
        </div>
      </div>

      <div
        className={
          fillViewport
            ? "flex min-h-0 flex-1 flex-col"
            : "min-h-0 flex-1 overflow-y-auto overscroll-contain"
        }
      >
      {/* Dashboard */}
      {view === "dashboard" && (
        <DashboardView boardFilterId={filterBoardId} boards={boards} />
      )}

      {/* Admin (platform + users) — nav gated in StudioShell */}
      {view === "admin" && <AdminPlatformView />}
      {view === "admin-users" && <AdminUsersView />}

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
            findLeadsEnabled={board?.workspace?.findLeadsEnabled !== false}
            leadsRemaining={
              board?.workspace?.planId === "insider"
                ? (board.workspace.firecrawlCreditsRemaining ?? null)
                : !board?.workspace?.metered
                  ? null
                  : Math.max(
                      0,
                      board.workspace.leadsLimit - board.workspace.leadsUsed,
                    )
            }
          />
          {running && <SearchProgress running={running} />}
          {!canSearchLive && !running && (
            <p className="mt-3 text-xs text-mist-500">
              No Firecrawl key — live search is unavailable. Add a key in Settings, or
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
        <div data-tour="pipeline-board" className="min-h-0 flex-1">
          <PipelineView
            leads={searchFilteredLeads}
            onOpen={openInfo}
            onMoveStage={onMoveStage}
          />
        </div>
      )}

      {/* All leads — table / cards / map */}
      {view === "leads" && (
        hasLeads ? (
          <div data-tour="leads-table" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="grid shrink-0 grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <p className="text-xs uppercase tracking-widest text-mist-500">
                <span className="font-semibold text-mist-200">
                  {leadsFilterPending ? "…" : filteredLeads.length}
                </span>
                {pipelineFilter !== "all" || leadSearch.trim() ? (
                  <>
                    {" "}
                    of{" "}
                    <span className="font-semibold text-mist-200">{board!.leads.length}</span>
                  </>
                ) : null}{" "}
                leads
              </p>
              <div className="glass inline-flex items-center justify-self-start rounded-full p-1 text-sm sm:justify-self-center">
                <LayoutToggle active={layout === "table"} onClick={() => selectLayout("table")}>
                  Table
                </LayoutToggle>
                <LayoutToggle active={layout === "cards"} onClick={() => selectLayout("cards")}>
                  Cards
                </LayoutToggle>
                <LayoutToggle active={layout === "map"} onClick={() => selectLayout("map")}>
                  Map
                </LayoutToggle>
              </div>
              <div className="flex items-center justify-start gap-2 sm:justify-end">
                <Select
                  value={pipelineFilter}
                  onChange={(e) =>
                    setPipelineFilter(
                      e.target.value === "all" ? "all" : (e.target.value as CrmStage),
                    )
                  }
                  className="min-w-[9rem] py-1.5 text-xs"
                  aria-label="Filter by pipeline stage"
                >
                  <option value="all">All stages</option>
                  {CRM_STAGE_FILTERS.map((s) => (
                    <option key={s} value={s}>
                      {crmStageLabel(s)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {/* Keep visited layouts mounted so Table ↔ Cards ↔ Map switches stay instant. */}
              {visitedLayouts.has("map") ? (
                <div
                  className={
                    layout === "map"
                      ? "absolute inset-0"
                      : "pointer-events-none invisible absolute inset-0 -z-10"
                  }
                  aria-hidden={layout !== "map"}
                >
                  <LeadMap
                    leads={mapLeads}
                    locationHint={board!.run?.location ?? null}
                    onOpen={openInfo}
                  />
                </div>
              ) : null}
              {visitedLayouts.has("cards") ? (
                <div
                  className={
                    layout === "cards"
                      ? "absolute inset-0 overflow-y-auto overscroll-contain"
                      : "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden"
                  }
                  aria-hidden={layout !== "cards"}
                >
                  {cardsLeads.length === 0 ? (
                    <p className="py-12 text-center text-sm text-mist-500">
                      No leads match this filter.
                    </p>
                  ) : (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {cardsLeads.map((lead, i) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          index={i}
                          onOpen={() => openInfo(lead.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              {visitedLayouts.has("table") ? (
                <div
                  className={
                    layout === "table"
                      ? "absolute inset-0 flex min-h-0 flex-col"
                      : "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden"
                  }
                  aria-hidden={layout !== "table"}
                >
                  <LeadTable
                    leads={tableLeads}
                    statusFilter={pipelineFilter}
                    onStatusFilterChange={setPipelineFilter}
                    onOpen={openInfo}
                    onMoveStage={editLocked ? undefined : onMoveStage}
                    onUpdateLead={editLocked ? undefined : onUpdateLeadCrm}
                    onDeleteLead={editLocked ? undefined : (id) => void onDeleteLead(id)}
                    onDeleteLeads={editLocked ? undefined : onDeleteLeads}
                    editLocked={editLocked}
                  />
                </div>
              ) : null}
              {showLeadsFilterSkeleton ? (
                <div
                  className="absolute inset-0 z-10 bg-ink-950/70 p-0 backdrop-blur-[1px]"
                  role="status"
                  aria-busy="true"
                  aria-label="Updating leads"
                >
                  <LeadsLayoutSkeleton layout={layout} />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div data-tour="leads-table" className="min-h-0 flex-1">
            <EmptyState />
          </div>
        )
      )}

      {/* Outreach queue — draft / approve / send */}
      {view === "outreach" && (
        <div className="min-h-0 flex-1">
          <OutreachView
            leads={searchFilteredLeads}
            canSendEmail={!!board?.capabilities.canSendEmail}
            emailVerify={!!board?.capabilities.emailVerify}
            busyId={outreachBusy}
            onOpenInfo={openInfo}
            onOpenDraft={openDraft}
            onCreateDraft={createAndOpenDraft}
            onApprove={approveContactDraft}
            onSend={async (outreachId) => {
              await requestSend(outreachId);
            }}
            onDraftAll={onDraftAllOutreach}
            onSendAll={onSendAllOutreach}
            onMarkContacted={onMarkContacted}
          />
        </div>
      )}

      {/* Runs view */}
      {view === "runs" && (
        <RunsView activeRunId={activeRunId ?? board?.run?.id ?? null} />
      )}
      </div>

      {selected && board && (
        <LeadDrawer
          lead={selected}
          mode={drawerMode}
          promptNote={drawerPromptNote}
          capabilities={board.capabilities}
          onClose={() => {
            setDrawerPromptNote(false);
            setSelectedId(null);
          }}
          onDraft={onDraft}
          onSaveDraft={onSaveDraft}
          onDecide={onDecide}
          onSend={async (id) => requestSend(id)}
          onSetDelivery={onSetDelivery}
          onUpdateCrm={onUpdateLeadCrm}
        />
      )}

      <Modal
        open={deletingLeads}
        onClose={() => {}}
        dismissible={false}
        showClose={false}
        title="Deleting leads…"
        className="max-w-sm border-aurora-400/20"
      >
        <div className="space-y-3">
          <p className="text-sm text-mist-300">
            {deleteProgress ? (
              <>
                <span className="tabular-nums text-mist-100">
                  {deleteProgress.done}
                </span>
                {" / "}
                <span className="tabular-nums">{deleteProgress.total}</span>
                {" leads"}
              </>
            ) : (
              "Removing from the board…"
            )}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-ink-950/60">
            <div
              className={`h-full rounded-full bg-aurora-400 transition-[width] duration-300 ease-out ${
                !deleteProgress || deleteProgress.done === 0
                  ? "animate-pulse w-1/3"
                  : ""
              }`}
              style={
                deleteProgress && deleteProgress.total > 0 && deleteProgress.done > 0
                  ? {
                      width: `${Math.min(
                        100,
                        (deleteProgress.done / deleteProgress.total) * 100,
                      )}%`,
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!importProgress}
        onClose={() => {}}
        dismissible={false}
        showClose={false}
        title="Importing leads…"
        className="max-w-sm border-aurora-400/20"
      >
        {importProgress ? (
          <>
            <p className="text-sm text-mist-300">
              <span className="tabular-nums text-mist-100">
                {Math.floor(importProgress.done)}
              </span>
              {" / "}
              <span className="tabular-nums">{importProgress.total}</span> rows
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink-950/60">
              <div
                className="h-full rounded-full bg-aurora-400 transition-[width] duration-150 ease-out"
                style={{
                  width: `${
                    importProgress.total
                      ? Math.min(
                          100,
                          Math.round(
                            (importProgress.done / importProgress.total) * 100,
                          ),
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={cancelImport}
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={!!pendingSendId}
        onClose={() => setPendingSendId(null)}
        title="Simulate send?"
      >
        <p className="text-sm text-mist-300">
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
            className="rounded-full bg-aurora-400 px-4 py-2 text-sm font-medium text-on-accent transition-transform hover:scale-[1.03]"
          >
            Simulate send
          </button>
        </div>
      </Modal>

      <Modal
        open={!!warmupWarn}
        onClose={() => setWarmupWarn(null)}
        title="Soft warmup recommend"
        className="max-w-md border-amber-400/20"
      >
        {warmupWarn ? (
          <>
            <p className="text-sm text-mist-300">
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
                className="rounded-full bg-aurora-400 px-4 py-2 text-sm font-medium text-on-accent transition-transform hover:scale-[1.03]"
              >
                Send anyway
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      {upgrade && (
        <UpgradeModal
          kind={upgrade.kind}
          planId={upgrade.planId}
          onClose={() => setUpgrade(null)}
        />
      )}

      {verifyLimitPlan && (
        <VerifyLimitModal
          planId={verifyLimitPlan}
          onClose={() => setVerifyLimitPlan(null)}
        />
      )}

      <BoardAssignModal
        open={assignOpen}
        title={assignMode === "search" ? "Save leads to which board?" : "Import to which board?"}
        subtitle={
          assignMode === "search"
            ? "Search results will be added to the board you pick."
            : "Rows land on this board. If the same company name already exists anywhere in your workspace, that lead is updated instead of duplicated."
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
      <div
        className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-2"
        role="status"
        aria-live="polite"
      >
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

"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  api,
  LEAD_PAGE_CHUNK,
  LEAD_PAGE_INITIAL,
  QuotaExceededError,
  type BoardResponse,
} from "@/lib/client-api";
import type { ContactMethod, CrmStage, LeadWithOutreach, PlanId } from "@/lib/types";
import { SearchPanel, type SearchValues } from "./SearchPanel";
import { LeadCard } from "./LeadCard";
import { LeadTable } from "./LeadTable";
import { LeadMap } from "./LeadMap";
import { prefetchLeadGeocodes } from "@/lib/geocode-client";
import { LeadDrawer } from "./LeadDrawer";
import { UpgradeModal, UsageBar } from "./UpgradeModal";
import { VerifyLimitModal } from "./VerifyLimitModal";
import { crmStageLabel, Spinner } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { ExportButton } from "./ExportButton";
import { PipelineView } from "./PipelineView";
import { OutreachView } from "./OutreachView";
import { RunsView } from "./RunsView";
import { ImportLeadsPanel } from "./ImportLeadsPanel";
import { LayoutToggle, EmptyState, SearchProgress } from "./StudioHelpers";
import {
  StudioViewSkeleton,
  LeadsLayoutSkeleton,
  OutreachSkeleton,
  PipelineSkeleton,
  useDeferredLoading,
} from "./skeletons";
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
type EngageView = "pipeline" | "outreach";

/** Merge a slim board-list row into a cached lead without wiping drawer detail. */
function mergeSlimIntoCached(
  prev: LeadWithOutreach,
  incoming: LeadWithOutreach,
): LeadWithOutreach {
  const keepDetail =
    prev.detailLoaded === true ||
    Boolean(prev.outreach?.body) ||
    Boolean(prev.aboutBlurb) ||
    Boolean(prev.notes);

  if (!keepDetail) return incoming;

  return {
    ...incoming,
    aboutBlurb: prev.aboutBlurb,
    notes: prev.notes,
    followUps: prev.followUps?.length ? prev.followUps : incoming.followUps,
    outreach:
      incoming.outreach && prev.outreach
        ? {
            ...incoming.outreach,
            body: prev.outreach.body || incoming.outreach.body,
            subject: prev.outreach.subject || incoming.outreach.subject,
          }
        : (incoming.outreach ?? prev.outreach),
    detailLoaded: true,
  };
}

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
  /** Toggle highlight — updates urgently; `layout` (pane) may lag in a transition. */
  const [layoutTab, setLayoutTab] = useState<"table" | "cards" | "map">("table");
  /** Keep each layout mounted after first visit so switching stays instant. */
  const [visitedLayouts, setVisitedLayouts] = useState<Set<"table" | "cards" | "map">>(
    () => new Set(["table"]),
  );
  /** Keep Pipeline/Outreach mounted so re-entering doesn’t rebuild 3k rows. */
  const [visitedEngage, setVisitedEngage] = useState<Set<EngageView>>(
    () => new Set(),
  );
  const [pipelineFilter, setPipelineFilter] = useState<CrmStage | "all">("all");
  const [leadSearch, setLeadSearch] = useState("");
  /** Outreach-only company-type filter (chrome next to search). */
  const [outreachTypeFilter, setOutreachTypeFilter] = useState("all");
  const [leadsHydrating, setLeadsHydrating] = useState(false);
  /** Background pages after first paint — UI stays interactive. */
  const [leadsBackfilling, setLeadsBackfilling] = useState(false);
  const [editLocked, setEditLocked] = useState(false);
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [upgrade, setUpgrade] = useState<UpgradePrompt | null>(null);
  const [verifyLimitPlan, setVerifyLimitPlan] = useState<PlanId | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [outreachBusy, setOutreachBusy] = useState<string | null>(null);
  const [addingLead, setAddingLead] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    /** Smooth display value (may lead confirmed slightly). */
    done: number;
    total: number;
  } | null>(null);
  const [draftProgress, setDraftProgress] = useState<{
    done: number;
    total: number;
    failed: number;
  } | null>(null);
  const draftAbortRef = useRef<AbortController | null>(null);
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
  const [verifyWarn, setVerifyWarn] = useState<{
    outreachId: string;
    message: string;
    reason: string | null;
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
  const boardRef = useRef<BoardResponse | null>(null);
  const leadsGenRef = useRef(0);
  /** Lead ids already toasted as bounced this session (null = not seeded yet). */
  const seenBouncedIdsRef = useRef<Set<string> | null>(null);

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
    const boardKey = filterBoardIdRef.current;

    // Dashboard/boards/admin: keep cached leads so returning to Leads is instant.
    if (lite) {
      const data = await api.board(boardKey, { lite: true });
      setBoards(data.boards ?? []);
      setBoard((prev) => {
        if (prev?.leads?.length) {
          const complete = prev.leadsHasMore === false;
          boardLiteRef.current = !complete;
          return {
            ...data,
            leads: prev.leads,
            leadsTotal: prev.leadsTotal ?? prev.leads.length,
            leadsHasMore: prev.leadsHasMore ?? false,
          };
        }
        boardLiteRef.current = true;
        return {
          ...data,
          leadsTotal: data.leadsTotal ?? 0,
          leadsHasMore: false,
        };
      });
      return data;
    }

    const gen = ++leadsGenRef.current;
    const prev = boardRef.current;
    const sameBoard = (prev?.activeBoardId ?? null) === (boardKey ?? null);
    const haveComplete =
      !!prev &&
      sameBoard &&
      prev.leadsHasMore === false &&
      prev.leads.length > 0;

    // Always page — never pull all ~3k fat/slim rows in one soft-refresh.
    const pageOpts = { limit: LEAD_PAGE_INITIAL, offset: 0 };

    const data = await api.board(boardKey, pageOpts);
    if (leadsGenRef.current !== gen) return data;

    boardLiteRef.current = false;
    setBoards(data.boards ?? []);
    const pinned = activeRunIdRef.current;
    if (pinned && pinned !== data.run?.id) {
      try {
        const { run, leads } = await api.runWithLeads(pinned);
        const merged = { ...data, run, leads, leadsHasMore: false };
        setBoard(merged);
        return merged;
      } catch {
        activeRunIdRef.current = null;
        setActiveRunId(null);
      }
    }
    // Soft refresh / pipeline poll: never replace a larger in-memory list with
    // a smaller page — that made Pipeline Contacted drop from ~169 → a handful.
    if (!!prev && sameBoard && prev.leads.length > 0) {
      const patch = new Map(data.leads.map((l) => [l.id, l]));
      const merged = prev.leads.map((l) => {
        const incoming = patch.get(l.id);
        return incoming ? mergeSlimIntoCached(l, incoming) : l;
      });
      const seen = new Set(merged.map((l) => l.id));
      for (const l of data.leads) {
        if (!seen.has(l.id)) merged.push(l);
      }
      const total = data.leadsTotal ?? prev.leadsTotal ?? merged.length;
      const stillMore = !haveComplete && merged.length < total;
      setBoard({
        ...data,
        leads: merged,
        leadsTotal: total,
        leadsHasMore: stillMore,
        crmStageCounts: data.crmStageCounts ?? prev.crmStageCounts,
      });
      if (stillMore && !leadsBackfilling) {
        setLeadsBackfilling(true);
        void (async () => {
          let offset = merged.length;
          try {
            while (true) {
              if (leadsGenRef.current !== gen) return;
              if (filterBoardIdRef.current !== boardKey) return;
              const chunk = await api.boardLeadsChunk(boardKey, {
                limit: LEAD_PAGE_CHUNK,
                offset,
              });
              if (leadsGenRef.current !== gen) return;
              setBoard((b) => {
                if (!b) return b;
                const have = new Set(b.leads.map((l) => l.id));
                const added = chunk.leads.filter((l) => !have.has(l.id));
                return {
                  ...b,
                  leads: [...b.leads, ...added],
                  leadsTotal: chunk.leadsTotal,
                  leadsHasMore: chunk.leadsHasMore,
                };
              });
              offset += chunk.leads.length;
              if (!chunk.leadsHasMore || chunk.leads.length === 0) break;
            }
          } catch {
            /* keep partial list */
          } finally {
            if (leadsGenRef.current === gen) setLeadsBackfilling(false);
          }
        })();
      }
      return data;
    }

    setBoard(data);

    // Progressive: show first page, keep loading the rest without blocking UI.
    if (data.leadsHasMore) {
      setLeadsBackfilling(true);
      void (async () => {
        let offset = data.leads.length;
        try {
          while (true) {
            if (leadsGenRef.current !== gen) return;
            if (filterBoardIdRef.current !== boardKey) return;
            const chunk = await api.boardLeadsChunk(boardKey, {
              limit: LEAD_PAGE_CHUNK,
              offset,
            });
            if (leadsGenRef.current !== gen) return;
            setBoard((b) => {
              if (!b) return b;
              const seen = new Set(b.leads.map((l) => l.id));
              const added = chunk.leads.filter((l) => !seen.has(l.id));
              return {
                ...b,
                leads: [...b.leads, ...added],
                leadsTotal: chunk.leadsTotal,
                leadsHasMore: chunk.leadsHasMore,
              };
            });
            offset += chunk.leads.length;
            if (!chunk.leadsHasMore || chunk.leads.length === 0) break;
          }
        } catch {
          /* keep partial list; user can refresh */
        } finally {
          if (leadsGenRef.current === gen) setLeadsBackfilling(false);
        }
      })();
    } else {
      setLeadsBackfilling(false);
    }

    return data;
  }, []);

  boardRef.current = board;

  // Notify when new bounces appear (webhooks update deliveryStatus asynchronously).
  useEffect(() => {
    const leads = board?.leads;
    if (!leads) return;
    const bounced = leads.filter((l) => l.outreach?.deliveryStatus === "bounced");
    const ids = bounced.map((l) => l.id);
    if (seenBouncedIdsRef.current === null) {
      seenBouncedIdsRef.current = new Set(ids);
      return;
    }
    const fresh = bounced.filter((l) => !seenBouncedIdsRef.current!.has(l.id));
    for (const id of ids) seenBouncedIdsRef.current.add(id);
    if (fresh.length === 0) return;
    const names = fresh.map((l) => l.company).slice(0, 2);
    toast(
      "err",
      fresh.length === 1
        ? `Email bounced: ${names[0]} — removed from Contacted.`
        : `${fresh.length} emails bounced (${names.join(", ")}${fresh.length > 2 ? "…" : ""}) — removed from Contacted.`,
    );
  }, [board?.leads, toast]);

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

  // Import/search board picker must see boards created on the Boards page.
  useEffect(() => {
    if (!assignOpen) return;
    void api
      .listBoards()
      .then(({ boards: list }) => setBoards(list))
      .catch(() => undefined);
  }, [assignOpen]);

  // Leaving dashboard/boards/admin → reload full lead payload for pipeline/etc.
  useEffect(() => {
    const needsLeads =
      view === "pipeline" ||
      view === "leads" ||
      view === "outreach" ||
      view === "board" ||
      view === "runs";
    if (!needsLeads || !boardLiteRef.current) return;
    let cancelled = false;
    setLeadsHydrating(true);
    void refresh({ forceFull: true })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLeadsHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, refresh]);

  // Keep Pipeline/Outreach mounted after first visit (instant re-entry).
  useEffect(() => {
    if (view !== "pipeline" && view !== "outreach") return;
    setVisitedEngage((prev) => {
      if (prev.has(view)) return prev;
      const next = new Set(prev);
      next.add(view);
      return next;
    });
  }, [view]);

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

  const onDraft = async (
    leadId: string,
    opts?: { silent?: boolean },
  ): Promise<string | null> => {
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
      patchLeadLocal(leadId, {
        outreach,
        status: "queued",
        detailLoaded: true,
      });
      if (!opts?.silent) {
        toast(
          "ok",
          pitch
            ? "Draft written — ready to contact."
            : "Empty draft created — add your template in Settings, or edit the body.",
        );
      }
      return outreach.id;
    } catch (e) {
      if (!opts?.silent) toast("err", (e as Error).message);
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
    boardRef.current?.leads.find((l) => l.outreach?.id === outreachId);

  const onSaveDraft = async (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
    opts?: { silent?: boolean },
  ) => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, patch);
      const lead = findLeadByOutreach(outreachId);
      if (lead) patchLeadLocal(lead.id, { outreach, detailLoaded: true });
      if (!opts?.silent) toast("ok", "Edits saved.");
    } catch (e) {
      toast("err", (e as Error).message);
      throw e;
    }
  };

  const onDecide = async (
    outreachId: string,
    decision: "approved" | "rejected",
    opts?: { silent?: boolean; leadId?: string },
  ) => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, { decision });
      const leadId =
        opts?.leadId ?? findLeadByOutreach(outreachId)?.id ?? null;
      if (leadId) {
        patchLeadLocal(leadId, {
          outreach,
          status: decision === "approved" ? "approved" : "rejected",
          detailLoaded: true,
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

  const closeLeadDrawer = useCallback(() => {
    setDrawerPromptNote(false);
    setSelectedId(null);
  }, []);

  const onSend = async (
    outreachId: string,
    opts?: { skipVerify?: boolean },
  ): Promise<boolean> => {
    try {
      const result = await api.send(outreachId, opts);
      recordWarmupSend();
      // Patch in place — a full refresh on a large board reloads page 1 only
      // and can hide the just-sent lead from Outreach → Contacted.
      if (result.outreach) {
        const sent = result.outreach;
        const followUps = result.followUps;
        setBoard((b) => {
          if (!b) return b;
          const prevToday = b.workspace.sendsToday ?? 0;
          const target = b.leads.find(
            (l) => l.outreach?.id === outreachId || l.id === sent.leadId,
          );
          const movedToContacted = target?.crmStage === "new";
          const counts = b.crmStageCounts
            ? { ...b.crmStageCounts }
            : undefined;
          if (counts && movedToContacted) {
            counts.new = Math.max(0, (counts.new ?? 0) - 1);
            counts.contacted = (counts.contacted ?? 0) + 1;
          }
          return {
            ...b,
            workspace: {
              ...b.workspace,
              sendsToday: prevToday + 1,
            },
            ...(counts ? { crmStageCounts: counts } : {}),
            leads: b.leads.map((l) => {
              if (l.outreach?.id !== outreachId && l.id !== sent.leadId) {
                return l;
              }
              const methods = l.contactMethods.includes("email")
                ? l.contactMethods
                : ([...l.contactMethods, "email"] as ContactMethod[]);
              return {
                ...l,
                status: "sent" as const,
                crmStage: l.crmStage === "new" ? "contacted" : l.crmStage,
                contactMethods: methods,
                outreach: sent,
                ...(followUps ? { followUps } : {}),
              };
            }),
          };
        });
      } else {
        await refresh();
      }
      toast(
        "ok",
        result.provider === "demo"
          ? "Sent (simulated — not delivered)."
          : "Email sent.",
      );
      return true;
    } catch (e) {
      await refresh();
      if (e instanceof QuotaExceededError && e.kind === "verifies") {
        setVerifyLimitPlan(e.planId);
        return false;
      }
      const err = e as Error & {
        undeliverableRemoved?: boolean;
        verifyBlocked?: boolean;
        canForce?: boolean;
        verifyReason?: string | null;
      };
      const msg = err.message;
      if (err.verifyBlocked && err.canForce && !opts?.skipVerify) {
        setVerifyWarn({
          outreachId,
          message: msg,
          reason: err.verifyReason ?? null,
        });
        return false;
      }
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
      return false;
    }
  };

  const runSend = async (
    outreachId: string,
    opts?: { skipVerify?: boolean },
  ): Promise<boolean> => {
    setOutreachBusy(outreachId);
    try {
      return await onSend(outreachId, opts);
    } finally {
      setOutreachBusy(null);
    }
  };

  /** Real delivery needs a provider; otherwise confirm simulate-or-settings. Soft warmup warn if over recommend. */
  const requestSend = async (outreachId: string): Promise<boolean> => {
    // Send click is the per-lead human gate — promote draft → approved first.
    const lead = findLeadByOutreach(outreachId);
    const st = lead?.outreach?.status;
    if (st === "sending") return false; // claim already in flight
    if (st === "draft" || st === "rejected" || st === "failed") {
      await onDecide(outreachId, "approved", { silent: true });
    }
    if (!board?.capabilities.canSendEmail) {
      setPendingSendId(outreachId);
      return false;
    }
    const status = warmupStatus();
    if (status.overSoftCap) {
      setWarmupWarn({
        outreachId,
        todayCount: status.todayCount,
        softCap: status.softCap,
      });
      return false;
    }
    return runSend(outreachId);
  };

  /** Contact Draft aurora: create draft if needed, approve, send in one step. */
  const approveAndSendContactDraft = async (leadId: string) => {
    setOutreachBusy(leadId);
    try {
      const lead = board?.leads.find((l) => l.id === leadId);
      let outreachId = lead?.outreach?.id ?? null;
      if (!outreachId) {
        outreachId = await onDraft(leadId);
        if (!outreachId) return;
      }
      await requestSend(outreachId);
    } finally {
      setOutreachBusy(null);
    }
  };

  const confirmSimulateSend = async () => {
    const id = pendingSendId;
    setPendingSendId(null);
    if (!id) return;
    const ok = await runSend(id);
    if (ok) closeLeadDrawer();
  };

  const confirmWarmupSend = async () => {
    const id = warmupWarn?.outreachId;
    setWarmupWarn(null);
    if (!id) return;
    const ok = await runSend(id);
    if (ok) closeLeadDrawer();
  };

  const confirmVerifyForceSend = async () => {
    const id = verifyWarn?.outreachId;
    setVerifyWarn(null);
    if (!id) return;
    const ok = await runSend(id, { skipVerify: true });
    if (ok) closeLeadDrawer();
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
        deliveryStatus === "bounced" ? "err" : "ok",
        deliveryStatus === "replied"
          ? "Marked replied — moved to In Conversation."
          : deliveryStatus === "bounced"
            ? "Bounced — removed from Contacted. Fix the address and try again."
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
        void ensureLeadDetail(leadId);
      }
    } finally {
      setOutreachBusy(null);
    }
  };

  const onUndoMarkContacted = async (leadId: string) => {
    await onMoveStage(leadId, "new", []);
    setDrawerPromptNote(false);
    setSelectedId(null);
    toast("ok", "Undone — lead back in Ready to Contact.");
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

  const cancelDraftAll = useCallback(() => {
    draftAbortRef.current?.abort();
  }, []);

  const onDraftAllOutreach = async () => {
    if (!board) return;
    // Email leads not yet sent — includes existing drafts so a profile change
    // can redraft everyone back into Ready to contact.
    const targets = board.leads.filter((l) => {
      if (l.emails.length === 0) return false;
      const s = l.outreach?.status;
      return s !== "sent" && s !== "sending";
    });
    if (targets.length === 0) return;

    const ac = new AbortController();
    draftAbortRef.current = ac;
    setOutreachBusy("draft-all");
    setDraftProgress({ done: 0, total: targets.length, failed: 0 });

    // Template-only drafts are cheap; AI personalize needs a smaller pool.
    const profile = loadSenderProfile();
    const concurrency = draftFlagsFromProfile(profile).aiPersonalize ? 4 : 8;

    let cursor = 0;
    let done = 0;
    let failed = 0;
    let ok = 0;

    const worker = async () => {
      while (true) {
        if (ac.signal.aborted) return;
        const i = cursor++;
        if (i >= targets.length) return;
        const lead = targets[i]!;
        const id = await onDraft(lead.id, { silent: true });
        if (ac.signal.aborted) return;
        if (!id) {
          failed += 1;
        } else {
          try {
            // Bulk draft lands in Ready (approved). Send stays per-lead.
            await onDecide(id, "approved", {
              silent: true,
              leadId: lead.id,
            });
            ok += 1;
          } catch {
            failed += 1;
          }
        }
        done += 1;
        setDraftProgress({ done, total: targets.length, failed });
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, targets.length) }, () =>
          worker(),
        ),
      );
      if (ac.signal.aborted) {
        toast(
          "ok",
          `Stopped — ${ok} ready to contact of ${targets.length}${
            failed ? ` (${failed} failed)` : ""
          }.`,
        );
      } else if (failed === 0) {
        toast(
          "ok",
          `${ok} lead${ok === 1 ? "" : "s"} ready to contact.`,
        );
      } else {
        toast(
          "err",
          `${ok} of ${targets.length} ready — ${failed} failed.`,
        );
      }
    } finally {
      setOutreachBusy(null);
      setDraftProgress(null);
      draftAbortRef.current = null;
    }
  };

  const ensureLeadDetail = useCallback(
    async (id: string) => {
      const cur = boardRef.current?.leads.find((l) => l.id === id);
      if (!cur || cur.detailLoaded !== false) return;
      try {
        const { lead } = await api.getLead(id);
        patchLeadLocal(id, { ...lead, detailLoaded: true });
      } catch (e) {
        toast("err", (e as Error).message);
      }
    },
    [toast],
  );

  const openInfo = (id: string) => {
    setDrawerPromptNote(false);
    setDrawerMode("info");
    setSelectedId(id);
    void ensureLeadDetail(id);
  };
  const openDraft = (id: string) => {
    setDrawerPromptNote(false);
    setDrawerMode("draft");
    setSelectedId(id);
    void ensureLeadDetail(id);
  };

  const onAddLead = async () => {
    if (addingLead || editLocked || !board) return;
    setAddingLead(true);
    try {
      const { lead } = await api.createLead({ boardId: filterBoardId });
      setBoard((b) =>
        b
          ? {
              ...b,
              leads: [lead, ...b.leads],
              workspace: {
                ...b.workspace,
                leadsUsed: b.workspace.leadsUsed + 1,
              },
            }
          : b,
      );
      setBoards((list) =>
        list.map((b) =>
          b.id === lead.boardId ? { ...b, leadCount: b.leadCount + 1 } : b,
        ),
      );
      openInfo(lead.id);
    } catch (e) {
      handleError(e);
    } finally {
      setAddingLead(false);
    }
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
  const [, startLayoutTransition] = useTransition();

  const searchFilteredLeads = useMemo(() => {
    const all = board?.leads ?? [];
    return all.filter((l) => leadMatchesSearch(l, deferredLeadSearch));
  }, [board?.leads, deferredLeadSearch, leadMatchesSearch]);

  const outreachCompanyTypes = useMemo(() => {
    const set = new Set<string>();
    for (const l of board?.leads ?? []) {
      const t = l.companyType?.trim();
      if (t) set.add(t);
    }
    return [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [board?.leads]);

  const outreachFilteredLeads = useMemo(() => {
    if (outreachTypeFilter === "all") return searchFilteredLeads;
    return searchFilteredLeads.filter(
      (l) => (l.companyType?.trim() || "") === outreachTypeFilter,
    );
  }, [searchFilteredLeads, outreachTypeFilter]);

  const filteredLeads = useMemo(() => {
    if (deferredPipelineFilter === "all") return searchFilteredLeads;
    return searchFilteredLeads.filter(
      (l) => (l.crmStage ?? "new") === deferredPipelineFilter,
    );
  }, [searchFilteredLeads, deferredPipelineFilter]);

  const leadsFilterPending =
    leadSearch !== deferredLeadSearch ||
    pipelineFilter !== deferredPipelineFilter;

  /** Tab highlight updates immediately; pane mount/swap is deferred. */
  const selectLayout = (next: "table" | "cards" | "map") => {
    setLayoutTab(next);
    if (next === layout && visitedLayouts.has(next)) return;
    startLayoutTransition(() => {
      setLayout(next);
      setVisitedLayouts((prev) => {
        if (prev.has(next)) return prev;
        const copy = new Set(prev);
        copy.add(next);
        return copy;
      });
    });
  };

  const tableLeads = useActiveLeads(layout === "table", filteredLeads);
  const cardsLeads = useActiveLeads(layout === "cards", filteredLeads);
  const mapLeads = useActiveLeads(layout === "map", filteredLeads);

  // Warm geocodes while user is on Pipeline/table — map opens with cache hits.
  useEffect(() => {
    if (view !== "leads" && view !== "pipeline") return;
    prefetchLeadGeocodes({
      locations: filteredLeads.map((l) => l.location),
      locationHint: board?.run?.location ?? null,
    });
  }, [view, filteredLeads, board?.run?.location]);

  // Yield one frame so Leads chrome paints before mounting heavy table/cards.
  // Warm revisits (data + current layout already known) skip the blank frame.
  const [leadsBodyReady, setLeadsBodyReady] = useState(false);
  const [, startLeadsBodyTransition] = useTransition();
  const layoutTabRef = useRef(layoutTab);
  layoutTabRef.current = layoutTab;
  const visitedLayoutsRef = useRef(visitedLayouts);
  visitedLayoutsRef.current = visitedLayouts;
  const boardLeadsLenRef = useRef(board?.leads.length ?? 0);
  boardLeadsLenRef.current = board?.leads.length ?? 0;
  useEffect(() => {
    if (view !== "leads") {
      setLeadsBodyReady(false);
      return;
    }
    const warm =
      visitedLayoutsRef.current.has(layoutTabRef.current) &&
      boardLeadsLenRef.current > 0;
    if (warm) {
      setLeadsBodyReady(true);
      return;
    }
    setLeadsBodyReady(false);
    const id = window.requestAnimationFrame(() => {
      startLeadsBodyTransition(() => setLeadsBodyReady(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [view]);

  const hasLeads = (board?.leads.length ?? 0) > 0;
  const canSearchLive = board?.capabilities.canSearchLive ?? false;
  /** Pipeline / outreach / leads fill the shell; other views scroll inside it. */
  const fillViewport =
    view === "pipeline" || view === "outreach" || view === "leads";
  const showLeadSearch =
    hasLeads &&
    (view === "leads" || view === "pipeline" || view === "outreach");

  // Skeleton for hydrate / first body / first visit to a layout tab only.
  const layoutPaneReady = visitedLayouts.has(layoutTab);
  const leadsContentPending =
    view === "leads" &&
    (loading ||
      leadsHydrating ||
      !board ||
      (hasLeads && (!leadsBodyReady || !layoutPaneReady)));
  const showLeadsContentSkeleton = useDeferredLoading(leadsContentPending, 0);

  // Views that need the board payload. Boards / dashboard / admin fetch their
  // own data — don't block them (avoids a second skeleton flash).
  const needsBoardPayload =
    view === "board" ||
    view === "pipeline" ||
    view === "leads" ||
    view === "outreach" ||
    view === "runs";
  if (loading && !board && needsBoardPayload) {
    return <StudioViewSkeleton view={view} />;
  }

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

        {view !== "dashboard" &&
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
          {view === "dashboard" && boards.length > 0 ? (
            <label className="inline-flex items-center">
              <span className="sr-only">Filter by board</span>
              <select
                value={filterBoardId ?? boards[0]!.id}
                onChange={(e) => {
                  const v = e.target.value;
                  storeBoardFilter(v);
                  router.replace(`/app?view=dashboard&board=${v}`, {
                    scroll: false,
                  });
                }}
                className="select-glass glass rounded-xl border border-white/10 py-2 pl-4 text-sm font-medium text-mist-100 outline-none transition-colors hover:border-white/20 focus:border-aurora-400/50"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {showLeadSearch ? (
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              {view === "outreach" ? (
                <label className="inline-flex min-w-0 items-center gap-2">
                  <span className="sr-only">Filter by lead type</span>
                  <Select
                    value={outreachTypeFilter}
                    onChange={(e) => setOutreachTypeFilter(e.target.value)}
                    className="max-w-[11rem] py-2 text-sm"
                    aria-label="Filter outreach by lead type"
                  >
                    <option value="all">All types</option>
                    {outreachCompanyTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
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
            </div>
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
          onBoardsChange={setBoards}
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

      {/* Pipeline — kept mounted after first visit for instant re-entry */}
      {(view === "pipeline" || visitedEngage.has("pipeline")) && (
        <div
          data-tour="pipeline-board"
          className={
            view === "pipeline" ? "min-h-0 flex-1" : "hidden"
          }
          aria-hidden={view !== "pipeline"}
        >
          {loading || leadsHydrating || !board ? (
            <div role="status" aria-busy="true" aria-label="Loading pipeline">
              <PipelineSkeleton />
            </div>
          ) : (
            <>
              {leadsBackfilling ? (
                <p
                  className="mb-2 text-[11px] text-mist-500"
                  role="status"
                  aria-live="polite"
                >
                  Loading more{" "}
                  <span className="tabular-nums text-mist-300">
                    {board.leads.length}
                    {board.leadsTotal != null ? `/${board.leadsTotal}` : ""}
                  </span>
                  … top cards first
                </p>
              ) : null}
              <PipelineView
                leads={searchFilteredLeads}
                stageCounts={board.crmStageCounts}
                backfilling={leadsBackfilling}
                onOpen={openInfo}
                onMoveStage={onMoveStage}
              />
            </>
          )}
        </div>
      )}

      {/* All leads — one chrome tree; skeleton/empty only in the body slot */}
      {view === "leads" && (
        <div data-tour="leads-table" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="grid shrink-0 grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-widest text-mist-500">
                <span className="font-semibold text-mist-200">
                  {loading ||
                  leadsHydrating ||
                  !board ||
                  leadsFilterPending ||
                  (hasLeads && !leadsBodyReady)
                    ? "…"
                    : filteredLeads.length}
                </span>
                {board &&
                hasLeads &&
                (pipelineFilter !== "all" || leadSearch.trim()) ? (
                  <>
                    {" "}
                    of{" "}
                    <span className="font-semibold text-mist-200">
                      {board.leadsTotal ?? board.leads.length}
                    </span>
                  </>
                ) : null}{" "}
                leads
                {leadsBackfilling ? (
                  <span className="ml-2 normal-case tracking-normal text-mist-500">
                    · loading{" "}
                    <span className="tabular-nums text-mist-300">
                      {board?.leads.length ?? 0}
                      {board?.leadsTotal != null
                        ? `/${board.leadsTotal}`
                        : ""}
                    </span>
                    …
                  </span>
                ) : null}
              </p>
              {board && !editLocked ? (
                <button
                  type="button"
                  onClick={() => void onAddLead()}
                  disabled={addingLead || loading || leadsHydrating}
                  className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-mist-100 transition-transform hover:scale-[1.02] disabled:opacity-50"
                >
                  {addingLead ? (
                    <Spinner className="h-3 w-3 text-aurora-300" />
                  ) : (
                    <span className="text-aurora-300" aria-hidden>
                      +
                    </span>
                  )}
                  Add lead
                </button>
              ) : null}
            </div>
            <div className="glass inline-flex items-center justify-self-start rounded-full p-1 text-sm sm:justify-self-center">
              <LayoutToggle active={layoutTab === "table"} onClick={() => selectLayout("table")}>
                Table
              </LayoutToggle>
              <LayoutToggle active={layoutTab === "cards"} onClick={() => selectLayout("cards")}>
                Cards
              </LayoutToggle>
              <LayoutToggle active={layoutTab === "map"} onClick={() => selectLayout("map")}>
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
            {loading || leadsHydrating || !board ? (
              <LeadsLayoutSkeleton layout={layoutTab} />
            ) : !hasLeads ? (
              <EmptyState />
            ) : (
              <>
                {/* Mount heavy panes only after Leads chrome has painted. */}
                {leadsBodyReady && visitedLayouts.has("map") ? (
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
                      locationHint={board.run?.location ?? null}
                      onOpen={openInfo}
                    />
                  </div>
                ) : null}
                {leadsBodyReady && visitedLayouts.has("cards") ? (
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
                {leadsBodyReady && visitedLayouts.has("table") ? (
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
                {showLeadsContentSkeleton ? (
                  <div
                    className="absolute inset-0 z-10 bg-ink-950/80"
                    role="status"
                    aria-busy="true"
                    aria-label="Loading leads"
                  >
                  <LeadsLayoutSkeleton layout={layoutTab} />
                </div>
              ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {/* Outreach — kept mounted after first visit for instant re-entry */}
      {(view === "outreach" || visitedEngage.has("outreach")) && (
        <div
          className={view === "outreach" ? "min-h-0 flex-1" : "hidden"}
          aria-hidden={view !== "outreach"}
        >
          {loading || leadsHydrating || !board ? (
            <div role="status" aria-busy="true" aria-label="Loading outreach">
              <OutreachSkeleton />
            </div>
          ) : (
            <OutreachView
              leads={outreachFilteredLeads}
              sendsToday={board.workspace.sendsToday ?? 0}
              canSendEmail={!!board.capabilities.canSendEmail}
              emailVerify={!!board.capabilities.emailVerify}
              busyId={outreachBusy}
              backfilling={leadsBackfilling}
              loadedCount={board.leads.length}
              totalCount={board.leadsTotal ?? board.leads.length}
              onOpenInfo={openInfo}
              onOpenDraft={openDraft}
              onCreateDraft={createAndOpenDraft}
              onApprove={approveContactDraft}
              onApproveAndSend={approveAndSendContactDraft}
              onSend={async (outreachId) => {
                await requestSend(outreachId);
              }}
              onDraftAll={onDraftAllOutreach}
              onMarkContacted={onMarkContacted}
            />
          )}
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
          onClose={closeLeadDrawer}
          onUndoMarkContacted={
            drawerPromptNote
              ? () => onUndoMarkContacted(selected.id)
              : undefined
          }
          onPromptNoteDone={() => setDrawerPromptNote(false)}
          onDraft={onDraft}
          onSaveDraft={onSaveDraft}
          onDecide={onDecide}
          onSend={requestSend}
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
        open={!!draftProgress}
        onClose={() => {}}
        dismissible={false}
        showClose={false}
        title="Drafting outreach…"
        className="max-w-sm border-aurora-400/20"
      >
        {draftProgress ? (
          <>
            <p className="text-sm text-mist-300">
              <span className="tabular-nums text-mist-100">
                {draftProgress.done}
              </span>
              {" / "}
              <span className="tabular-nums">{draftProgress.total}</span> leads
              {draftProgress.failed > 0 ? (
                <span className="text-mist-500">
                  {" "}
                  · {draftProgress.failed} failed
                </span>
              ) : null}
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink-950/60">
              <div
                className="h-full rounded-full bg-aurora-400 transition-[width] duration-150 ease-out"
                style={{
                  width: `${
                    draftProgress.total
                      ? Math.min(
                          100,
                          Math.round(
                            (draftProgress.done / draftProgress.total) * 100,
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
                onClick={cancelDraftAll}
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}
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

      <Modal
        open={!!verifyWarn}
        onClose={() => setVerifyWarn(null)}
        title="Verifier unsure"
        className="max-w-md border-amber-400/20"
      >
        {verifyWarn ? (
          <>
            <p className="text-sm text-mist-300">{verifyWarn.message}</p>
            {verifyWarn.reason ? (
              <p className="mt-2 text-xs text-mist-500">
                Provider detail: {verifyWarn.reason}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setVerifyWarn(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-mist-400 hover:text-mist-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmVerifyForceSend()}
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
        onBoardsChange={setBoards}
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

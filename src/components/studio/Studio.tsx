"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  api,
  LEAD_PAGE_PER_LANE,
  QuotaExceededError,
  RateLimitedError,
  type BoardResponse,
} from "@/lib/client-api";
import type { ContactMethod, CrmStage, FollowUp, Lead, LeadWithOutreach, PlanId } from "@/lib/types";
import { mergeFollowUpLists } from "@/lib/follow-ups";
import { rememberDroppedContactMethods } from "@/lib/contact-methods";
import {
  droppedFollowUpIdSet,
  mergeMutationIntoCached,
  mergeSlimIntoCached,
  rememberDroppedFollowUps,
} from "@/lib/lead-cache";
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
import {
  OutreachView,
  canRedraftOutreach,
  needsOutreachDraft,
} from "./OutreachView";
import { CalendarView } from "./CalendarView";
import { RunsView } from "./RunsView";
import { ImportLeadsPanel } from "./ImportLeadsPanel";
import { LayoutToggle, EmptyState, SearchProgress } from "./StudioHelpers";
import {
  StudioViewSkeleton,
  LeadsLayoutSkeleton,
  OutreachSkeleton,
  PipelineSkeleton,
  CalendarSkeleton,
  useDeferredLoading,
} from "./skeletons";
import { recordWarmupSend } from "@/lib/email/warmup";
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
import {
  loadStudioUiPrefs,
  saveStudioUiPrefs,
  type LeadsLayout,
} from "./studio-ui-prefs";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { TypeFilterMenu } from "./TypeFilterMenu";
import type { BoardSummary, ImportLeadRow } from "@/lib/types";

const CRM_STAGE_FILTERS: CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
];

type Toast = {
  id: string;
  kind: "ok" | "err";
  text: string;
  actionLabel?: string;
  onAction?: () => void;
};
type UpgradePrompt = { kind: "leads" | "sends"; planId: PlanId };
type StudioView =
  | "board"
  | "pipeline"
  | "leads"
  | "outreach"
  | "calendar"
  | "runs"
  | "dashboard"
  | "boards"
  | "admin"
  | "admin-users";
/** Views kept mounted after first visit so filters / sort / scroll survive. */
type StickyView = "pipeline" | "outreach" | "leads";

function omitDroppedLeadIds<T extends { id: string }>(
  leads: T[],
  dropped: ReadonlySet<string>,
): T[] {
  if (dropped.size === 0) return leads;
  return leads.filter((l) => !dropped.has(l.id));
}

function appendUnseenLeads(
  existing: LeadWithOutreach[],
  incoming: LeadWithOutreach[],
  dropped: ReadonlySet<string>,
): LeadWithOutreach[] {
  const have = new Set(existing.map((l) => l.id));
  const added = incoming.filter((l) => !have.has(l.id) && !dropped.has(l.id));
  return added.length === 0 ? existing : [...existing, ...added];
}

function viewFromParams(view: string | null): StudioView {
  if (view === "pipeline") return "pipeline";
  if (view === "leads") return "leads";
  if (view === "outreach") return "outreach";
  if (view === "calendar") return "calendar";
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
  else if (next === "calendar") params.set("view", "calendar");
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
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const actorName =
    (session?.user?.name as string | undefined)?.trim() ||
    (session?.user?.email as string | undefined)?.split("@")[0] ||
    null;
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
  const [drawerPromptNote, setDrawerPromptNote] = useState<
    false | "call" | "missed"
  >(false);
  const [layout, setLayout] = useState<LeadsLayout>("table");
  /** Toggle highlight — updates urgently; `layout` (pane) may lag in a transition. */
  const [layoutTab, setLayoutTab] = useState<LeadsLayout>("table");
  /** Keep each layout mounted after first visit so switching stays instant. */
  const [visitedLayouts, setVisitedLayouts] = useState<Set<LeadsLayout>>(
    () => new Set(["table"]),
  );
  /** Keep Pipeline / Outreach / Leads mounted so re-entering doesn’t rebuild. */
  const [visitedSticky, setVisitedSticky] = useState<Set<StickyView>>(
    () => new Set(),
  );
  const [pipelineFilter, setPipelineFilter] = useState<CrmStage | "all">("all");
  const [leadSearch, setLeadSearch] = useState("");
  /** Outreach-only company-type filter (chrome next to search). */
  const [outreachTypeFilter, setOutreachTypeFilter] = useState("all");
  /** Skip the first persist pass so we don’t overwrite sessionStorage with defaults. */
  const skipUiPrefsPersistRef = useRef(true);
  const [leadsHydrating, setLeadsHydrating] = useState(false);
  /** Background pages after first paint — UI stays interactive. */
  const [leadsBackfilling, setLeadsBackfilling] = useState(false);
  const [editLocked, setEditLocked] = useState(false);
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const [takingOver, setTakingOver] = useState(false);
  const takeoverRef = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [noteUndo, setNoteUndo] = useState<{
    leadId: string;
    note: FollowUp;
  } | null>(null);
  const noteUndoTimerRef = useRef<number | null>(null);
  const [toastHost, setToastHost] = useState<HTMLElement | null>(null);
  const [upgrade, setUpgrade] = useState<UpgradePrompt | null>(null);
  const [verifyLimitPlan, setVerifyLimitPlan] = useState<PlanId | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  /** Concurrent outreach actions — per lead/outreach id (send verify is non-blocking). */
  const [outreachBusyIds, setOutreachBusyIds] = useState<string[]>([]);
  const markOutreachBusy = useCallback((...ids: string[]) => {
    setOutreachBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return [...next];
    });
  }, []);
  const clearOutreachBusy = useCallback((...ids: string[]) => {
    setOutreachBusyIds((prev) => prev.filter((id) => !ids.includes(id)));
  }, []);
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
  const [verifyWarn, setVerifyWarn] = useState<{
    outreachId: string;
    email: string | null;
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
  /** Ids removed this session — stale polls must not push them back onto the board. */
  const droppedLeadIdsRef = useRef(new Set<string>());
  const leadsBackfillingRef = useRef(false);
  const loadInFlightRef = useRef(false);
  /** Serialize CRM PATCHes per lead so a heal cannot last-write-win over a newer journal. */
  const leadWriteTailRef = useRef(new Map<string, Promise<void>>());
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

  const toastTimers = useRef(new Map<string, number>());
  const toast = useCallback(
    (
      kind: Toast["kind"],
      text: string,
      ms = 4200,
      key?: string,
      action?: { label: string; onClick: () => void },
    ) => {
      const id = key ?? `t-${Date.now()}-${Math.random()}`;
      const prev = toastTimers.current.get(id);
      if (prev) window.clearTimeout(prev);
      setToasts((t) => [
        ...t.filter((x) => x.id !== id),
        {
          id,
          kind,
          text,
          actionLabel: action?.label,
          onAction: action?.onClick,
        },
      ]);
      const timer = window.setTimeout(() => {
        toastTimers.current.delete(id);
        setToasts((t) => t.filter((x) => x.id !== id));
      }, ms);
      toastTimers.current.set(id, timer);
    },
    [],
  );

  const dismissToast = useCallback((key: string) => {
    const prev = toastTimers.current.get(key);
    if (prev) window.clearTimeout(prev);
    toastTimers.current.delete(key);
    setToasts((t) => t.filter((x) => x.id !== key));
  }, []);

  useEffect(() => {
    setToastHost(document.body);
  }, []);

  useEffect(
    () => () => {
      if (noteUndoTimerRef.current != null) {
        window.clearTimeout(noteUndoTimerRef.current);
      }
    },
    [],
  );

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof QuotaExceededError) {
        if (e.kind === "verifies") setVerifyLimitPlan(e.planId);
        else setUpgrade({ kind: e.kind, planId: e.planId });
      } else if (e instanceof RateLimitedError) {
        const sec = Math.max(1, Math.ceil(e.retryAfterMs / 1000));
        toast(
          "err",
          e.message ||
            `Sending too fast — try again in ${sec}s.`,
          Math.min(12_000, e.retryAfterMs + 2000),
          "rate-limit",
        );
      } else {
        toast("err", (e as Error).message);
      }
    },
    [toast],
  );

  const refresh = useCallback(async (opts?: { forceFull?: boolean; replace?: boolean }) => {
    const replace = !!opts?.replace || !!opts?.forceFull;
    const v = viewRef.current;
    const lite =
      !opts?.forceFull &&
      (v === "dashboard" ||
        v === "boards" ||
        v === "admin" ||
        v === "admin-users");
    const boardKey = filterBoardIdRef.current;

    // Dashboard/boards/admin: keep cached leads so returning to Leads is instant.
    // Only reuse leads when the sidebar board filter matches — otherwise a board
    // switch poisons activeBoardId while leaving the previous board's rows.
    if (lite) {
      const data = await api.board(boardKey, { lite: true });
      setBoards(data.boards ?? []);
      setBoard((prev) => {
        const sameBoard = (prev?.activeBoardId ?? null) === (boardKey ?? null);
        if (sameBoard && prev?.leads?.length) {
          const complete = prev.leadsHasMore === false;
          boardLiteRef.current = !complete;
          return {
            ...data,
            leads: omitDroppedLeadIds(prev.leads, droppedLeadIdsRef.current),
            leadsTotal: prev.leadsTotal ?? prev.leads.length,
            leadsHasMore: prev.leadsHasMore ?? false,
          };
        }
        boardLiteRef.current = true;
        return {
          ...data,
          leads: omitDroppedLeadIds(
            sameBoard ? (prev?.leads ?? data.leads) : data.leads,
            droppedLeadIdsRef.current,
          ),
          leadsTotal: data.leadsTotal ?? 0,
          leadsHasMore: false,
        };
      });
      return data;
    }

    // Soft poll / mutation refresh must not cancel an in-flight first page or
    // restart paging from offset 50 — that left Pipeline spinning forever
    // (especially with two users sharing D1).
    if (!replace && (loadInFlightRef.current || leadsBackfillingRef.current)) {
      const cached = boardRef.current;
      if (cached) return cached;
    }

    const gen = replace ? ++leadsGenRef.current : leadsGenRef.current;
    if (replace) {
      leadsBackfillingRef.current = false;
      loadInFlightRef.current = true;
    }

    const beginBackfill = (g: number, key: string | null) => {
      if (leadsBackfillingRef.current) return;
      leadsBackfillingRef.current = true;
      setLeadsBackfilling(true);
      void (async () => {
        let offset = LEAD_PAGE_PER_LANE;
        try {
          while (true) {
            if (leadsGenRef.current !== g) return;
            if (filterBoardIdRef.current !== key) return;
            const chunk = await api.boardLeadsChunk(key, {
              perLane: LEAD_PAGE_PER_LANE,
              laneOffset: offset,
            });
            if (leadsGenRef.current !== g) return;
            if (filterBoardIdRef.current !== key) return;
            setBoard((b) => {
              if (!b || leadsGenRef.current !== g) return b;
              if (filterBoardIdRef.current !== key) return b;
              return {
                ...b,
                leads: appendUnseenLeads(
                  b.leads,
                  chunk.leads,
                  droppedLeadIdsRef.current,
                ),
                leadsTotal: chunk.leadsTotal,
                leadsHasMore: chunk.leadsHasMore,
              };
            });
            offset += LEAD_PAGE_PER_LANE;
            if (!chunk.leadsHasMore || chunk.leads.length === 0) break;
          }
        } catch {
          /* keep partial list */
        } finally {
          if (leadsGenRef.current === g) {
            leadsBackfillingRef.current = false;
            setLeadsBackfilling(false);
          }
        }
      })();
    };

    const pageOpts = { perLane: LEAD_PAGE_PER_LANE, laneOffset: 0 };
    const fetchStartedAt = performance.now();
    try {
      const data = await api.board(boardKey, pageOpts);
      if (leadsGenRef.current !== gen) return data;

      boardLiteRef.current = false;
      setBoards(data.boards ?? []);

      // Requested board gone (deleted) — drop sticky filter + hard-replace leads.
      if (
        boardKey &&
        !(data.boards ?? []).some((b) => b.id === boardKey)
      ) {
        storeBoardFilter("");
        if (typeof window !== "undefined") {
          const next = `/app${queryForView(viewRef.current, null)}`;
          window.history.replaceState({}, "", next);
        }
        setBoard((b) => {
          const dropped = droppedLeadIdsRef.current;
          const incomingLeads = omitDroppedLeadIds(data.leads, dropped);
          const prevById = new Map((b?.leads ?? []).map((l) => [l.id, l]));
          return {
            ...data,
            leads: incomingLeads.map((l) => {
              const old = prevById.get(l.id);
              return old
                ? mergeSlimIntoCached(old, l, { fetchStartedAt })
                : l;
            }),
            leadsTotal: data.leadsTotal ?? incomingLeads.length,
            leadsHasMore: !!data.leadsHasMore,
          };
        });
        if (data.leadsHasMore) beginBackfill(gen, null);
        else {
          leadsBackfillingRef.current = false;
          setLeadsBackfilling(false);
        }
        return data;
      }

      const pinned = activeRunIdRef.current;
      if (pinned && pinned !== data.run?.id) {
        try {
          const { run, leads } = await api.runWithLeads(pinned);
          if (leadsGenRef.current !== gen) return data;
          setBoard((b) => {
            const incoming = omitDroppedLeadIds(
              leads,
              droppedLeadIdsRef.current,
            );
            const prevById = new Map((b?.leads ?? []).map((l) => [l.id, l]));
            return {
              ...data,
              run,
              leads: incoming.map((l) => {
                const old = prevById.get(l.id);
                return old
                  ? mergeSlimIntoCached(old, l, { fetchStartedAt })
                  : l;
              }),
              leadsHasMore: false,
            };
          });
          leadsBackfillingRef.current = false;
          setLeadsBackfilling(false);
          return data;
        } catch {
          activeRunIdRef.current = null;
          setActiveRunId(null);
        }
      }

      const hadBoard = !!boardRef.current;
      const replaceList = replace || !hadBoard;

      setBoard((b) => {
        const dropped = droppedLeadIdsRef.current;
        const incomingLeads = omitDroppedLeadIds(data.leads, dropped);
        const sameBoard = (b?.activeBoardId ?? null) === (boardKey ?? null);
        const prevById =
          sameBoard && b
            ? new Map(b.leads.map((l) => [l.id, l]))
            : null;

        if (replaceList || !b || !sameBoard) {
          return {
            ...data,
            leads: incomingLeads.map((l) => {
              const old = prevById?.get(l.id);
              return old
                ? mergeSlimIntoCached(old, l, { fetchStartedAt })
                : l;
            }),
            leadsTotal: data.leadsTotal ?? incomingLeads.length,
            leadsHasMore: !!data.leadsHasMore,
            crmStageCounts: data.crmStageCounts ?? b?.crmStageCounts,
          };
        }

        // Soft merge: patch page 1 into the already-loaded list. Never shrink
        // to a single page (that emptied Pipeline Contacted) and never resurrect
        // ids dropped this session.
        const patch = new Map(incomingLeads.map((l) => [l.id, l]));
        const merged = omitDroppedLeadIds(b.leads, dropped).map((l) => {
          const incoming = patch.get(l.id);
          return incoming
            ? mergeSlimIntoCached(l, incoming, { fetchStartedAt })
            : l;
        });
        const seen = new Set(merged.map((l) => l.id));
        for (const l of incomingLeads) {
          if (!seen.has(l.id)) merged.push(l);
        }
        return {
          ...b,
          ...data,
          leads: merged,
          leadsTotal: data.leadsTotal ?? b.leadsTotal ?? merged.length,
          leadsHasMore:
            b.leadsHasMore === false ? false : !!data.leadsHasMore,
          crmStageCounts: data.crmStageCounts ?? b.crmStageCounts,
        };
      });

      if (replaceList && data.leadsHasMore) {
        beginBackfill(gen, boardKey);
      } else if (replaceList) {
        leadsBackfillingRef.current = false;
        setLeadsBackfilling(false);
      }
      return data;
    } finally {
      if (replace && leadsGenRef.current === gen) {
        loadInFlightRef.current = false;
      }
    }
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

  // Restore filters / layout from this browser tab (no DB).
  useEffect(() => {
    const prefs = loadStudioUiPrefs();
    setLeadSearch(prefs.leadSearch);
    setPipelineFilter(prefs.pipelineFilter);
    setOutreachTypeFilter(prefs.outreachTypeFilter);
    setLayout(prefs.layout);
    setLayoutTab(prefs.layout);
    setVisitedLayouts((prev) => {
      if (prev.has(prefs.layout)) return prev;
      const next = new Set(prev);
      next.add(prefs.layout);
      return next;
    });
  }, []);

  // Persist chrome prefs (survives Settings → back within the same tab).
  useEffect(() => {
    if (skipUiPrefsPersistRef.current) {
      skipUiPrefsPersistRef.current = false;
      return;
    }
    saveStudioUiPrefs({
      leadSearch,
      pipelineFilter,
      outreachTypeFilter,
      layout,
    });
  }, [leadSearch, pipelineFilter, outreachTypeFilter, layout]);

  // Initial load + re-fetch when sidebar board filter changes (single effect).
  // Soft-refresh after first paint so adding `?board=` mid-tour doesn't flash
  // the full-page spinner (that looked like a double render).
  // Board switch (not first mount): drop sticky filters so Outreach doesn’t look empty.
  const prevFilterBoardRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevFilterBoardRef.current === undefined) {
      prevFilterBoardRef.current = filterBoardId;
      return;
    }
    if (prevFilterBoardRef.current === filterBoardId) return;
    prevFilterBoardRef.current = filterBoardId;
    setOutreachTypeFilter("all");
    setLeadSearch("");
    setPipelineFilter("all");
  }, [filterBoardId]);

  useEffect(() => {
    if (boardParam) storeBoardFilter(boardParam);
    const first = !hasLoadedRef.current;
    if (first) setLoading(true);
    else setLeadsHydrating(true);
    void refresh({ replace: true })
      .then(() => {
        hasLoadedRef.current = true;
      })
      .catch((e) => toast("err", e.message))
      .finally(() => {
        if (first) setLoading(false);
        else setLeadsHydrating(false);
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
      view === "calendar" ||
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

  // Keep Pipeline / Outreach / Leads mounted after first visit (instant re-entry).
  useEffect(() => {
    if (view !== "pipeline" && view !== "outreach" && view !== "leads") return;
    setVisitedSticky((prev) => {
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
      if (loadInFlightRef.current || leadsBackfillingRef.current) return;
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
      storeBoardFilter("");
      setEditLocked(false);
      setLockHolder(null);
      router.replace(`/app${queryForView(view, null)}`, { scroll: false });
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
          takeoverRef.current = false;
          setEditLocked(true);
          setLockHolder(
            msg.split(" is working")[0] ||
              boardRef.current?.boardLock?.userName ||
              "Someone else",
          );
        }
      }
    };
    void beat();
    const id = window.setInterval(() => void beat(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      void api.releaseBoardLock(bid).catch(() => undefined);
    };
  }, [filterBoardId, boards, router, view]);

  useEffect(() => {
    takeoverRef.current = false;
  }, [filterBoardId]);

  useEffect(() => {
    if (takeoverRef.current) return;
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
      params.delete("upgraded");
      const q = params.toString();
      window.history.replaceState({}, "", q ? `/app?${q}` : "/app");
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
      const data = await refresh({ replace: true });
      const n = data.leadsTotal ?? data.run?.leadCount ?? data.leads.length;
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
    const list = boards.length ? boards : board?.boards ?? [];
    const preferred =
      (filterBoardId && list.some((b) => b.id === filterBoardId)
        ? filterBoardId
        : null) ?? list[0]?.id ?? null;
    // Sidebar already names the board — skip the extra picker click.
    if (preferred) {
      void executeSearch(v, preferred);
      return;
    }
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
      await refresh({ replace: true });
      setView("leads");
    } catch (e) {
      if (ac.signal.aborted || (e as Error).name === "AbortError") {
        toast("ok", "Import cancelled.");
        await refresh({ replace: true });
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

  const enqueueLeadWrite = (leadId: string, fn: () => Promise<void>) => {
    const tail = leadWriteTailRef.current;
    const prev = tail.get(leadId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    tail.set(
      leadId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  };

  const patchLeadLocal = (
    leadId: string,
    next: Partial<LeadWithOutreach>,
    opts?: { pending?: boolean },
  ) => {
    const lastWriteAt = performance.now();
    setBoard((b) =>
      b
        ? {
            ...b,
            leads: b.leads.map((l) =>
              l.id === leadId
                ? {
                    ...l,
                    ...next,
                    lastWriteAt,
                    writePending: opts?.pending ? true : l.writePending,
                  }
                : l,
            ),
          }
        : b,
    );
    return lastWriteAt;
  };

  /** Apply a PATCH lead without dropping optimistic journal / chip rows. */
  const applyServerLead = (
    leadId: string,
    lead: Lead,
    patch: Record<string, unknown>,
    writeAt?: number,
  ) => {
    setBoard((b) => {
      if (!b) return b;
      return {
        ...b,
        leads: b.leads.map((l) =>
          l.id === leadId
            ? mergeMutationIntoCached(l, lead, patch, writeAt)
            : l,
        ),
      };
    });
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
            ? "Draft written — waiting for approval."
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
    markOutreachBusy(leadId);
    try {
      const id = await onDraft(leadId);
      if (id) openDraft(leadId);
    } finally {
      clearOutreachBusy(leadId);
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
        const leadStatus =
          outreach.status === "approved"
            ? "approved"
            : outreach.status === "rejected"
              ? "rejected"
              : outreach.status === "sent"
                ? "sent"
                : outreach.status === "failed"
                  ? "failed"
                  : "queued";
        patchLeadLocal(leadId, {
          outreach,
          status: leadStatus,
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
      const cur = boardRef.current;
      const warmupScope =
        cur?.boards.find((b) => b.id === cur.activeBoardId)?.outreachProfileId ??
        cur?.activeBoardId ??
        null;
      recordWarmupSend(warmupScope);
      // Patch in place — a full refresh on a large board reloads page 1 only
      // and can hide the just-sent lead from Outreach → Contacted.
      if (result.outreach) {
        const sent = result.outreach;
        const followUps = result.followUps;
        const lastWriteAt = performance.now();
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
                lastWriteAt,
                writePending: undefined,
                ...(followUps
                  ? {
                      followUps: mergeFollowUpLists(
                        l.followUps ?? [],
                        followUps,
                        droppedFollowUpIdSet(l),
                      ),
                    }
                  : {}),
              };
            }),
          };
        });
      } else {
        await refresh();
      }
      {
        const lead = findLeadByOutreach(outreachId);
        const to =
          result.outreach?.toEmail ??
          lead?.outreach?.toEmail ??
          lead?.emails?.[0] ??
          null;
        dismissToast(`send-${outreachId}`);
        toast(
          "ok",
          result.provider === "demo"
            ? to
              ? `Sent to ${to} (simulated — not delivered).`
              : "Sent (simulated — not delivered)."
            : to
              ? `Sent to ${to}.`
              : "Email sent.",
          4200,
          `send-${outreachId}`,
        );
      }
      return true;
    } catch (e) {
      dismissToast(`send-${outreachId}`);
      await refresh();
      if (e instanceof QuotaExceededError && e.kind === "verifies") {
        setVerifyLimitPlan(e.planId);
        return false;
      }
      if (e instanceof QuotaExceededError && e.kind === "sends") {
        setUpgrade({ kind: "sends", planId: e.planId });
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
        const lead = findLeadByOutreach(outreachId);
        const email =
          lead?.outreach?.toEmail ?? lead?.emails?.[0] ?? null;
        setVerifyWarn({
          outreachId,
          email,
          message: msg,
          reason: err.verifyReason ?? null,
        });
        return false;
      }
      if (err.undeliverableRemoved || /isn.?t real|can.?t receive mail|undeliverable/i.test(msg)) {
        toast("err", msg);
      } else if (/not ready to send/i.test(msg)) {
        toast("err", "Draft this lead first, then send.");
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
    const lead = findLeadByOutreach(outreachId);
    const to =
      lead?.outreach?.toEmail ?? lead?.emails?.[0] ?? null;
    const busyKeys = [outreachId, ...(lead ? [lead.id] : [])];
    markOutreachBusy(...busyKeys);
    const verifyOn =
      !!boardRef.current?.capabilities.emailVerify &&
      boardRef.current?.workspace.emailVerifyEnabled !== false &&
      !opts?.skipVerify;
    const toastKey = `send-${outreachId}`;
    let phaseTimer: number | undefined;
    if (verifyOn && to) {
      // MEV can take up to ~25s — phase toast, then Sent… replaces the same key.
      toast("ok", `Verifying ${to}…`, 28000, toastKey);
      phaseTimer = window.setTimeout(() => {
        toast("ok", `Sending to ${to}…`, 28000, toastKey);
      }, 1600);
    } else if (to) {
      toast("ok", `Sending to ${to}…`, 28000, toastKey);
    }
    try {
      return await onSend(outreachId, opts);
    } finally {
      if (phaseTimer) window.clearTimeout(phaseTimer);
      clearOutreachBusy(...busyKeys);
    }
  };

  /** Real delivery needs a provider; otherwise confirm simulate-or-settings. */
  const requestSend = async (outreachId: string): Promise<boolean> => {
    // Per-lead Send click is the human gate (ADR 0029).
    const lead = findLeadByOutreach(outreachId);
    const st = lead?.outreach?.status;
    if (st === "sending") return false; // claim already in flight
    if (st === "rejected") {
      await onDecide(outreachId, "approved", { silent: true });
    }
    if (!board?.capabilities.canSendEmail) {
      setPendingSendId(outreachId);
      return false;
    }
    const ws = board.workspace;
    if (
      !ws.unlimitedSends &&
      ws.sendsLimit > 0 &&
      ws.sendsUsed >= ws.sendsLimit
    ) {
      setUpgrade({ kind: "sends", planId: ws.planId });
      return false;
    }
    // Soft daily warmup recommend is non-blocking (Outreach Contacted column
    // hint only) — never interrupt Send with a modal.
    return runSend(outreachId);
  };

  const confirmSimulateSend = async () => {
    const id = pendingSendId;
    setPendingSendId(null);
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
    const droppedContactMethods = rememberDroppedContactMethods(
      boardRef.current?.leads.find((l) => l.id === leadId),
      patch.contactMethods,
    );
    const writeAt = patchLeadLocal(
      leadId,
      {
        ...patch,
        ...(droppedContactMethods ? { droppedContactMethods } : {}),
      },
      { pending: true },
    );
    try {
      await enqueueLeadWrite(leadId, async () => {
        const latest = boardRef.current?.leads.find((l) => l.id === leadId);
        const body = latest
          ? {
              crmStage: latest.crmStage,
              ...(patch.contactMethods !== undefined
                ? { contactMethods: latest.contactMethods }
                : {}),
            }
          : patch;
        const { lead } = await api.updateLead(leadId, body);
        applyServerLead(leadId, lead, body, writeAt);
      });
    } catch (e) {
      // Revert on failure by refreshing.
      await refresh();
      toast("err", (e as Error).message);
    }
  };

  const onMarkContacted = async (
    leadId: string,
    method: ContactMethod,
    opts?: { promptNote?: boolean; missed?: boolean },
  ) => {
    markOutreachBusy(leadId);
    try {
      const existing =
        boardRef.current?.leads.find((l) => l.id === leadId)?.contactMethods ??
        [];
      const methods = existing.includes(method)
        ? existing
        : [...existing, method];
      await onMoveStage(leadId, "contacted", methods);
      toast(
        "ok",
        method === "phone"
          ? opts?.missed
            ? "Logged as missed call — moved to Contacted."
            : "Logged as called — moved to Contacted."
          : "Logged contact form — moved to Contacted.",
      );
      if (opts?.promptNote) {
        setDrawerPromptNote(opts.missed ? "missed" : "call");
        setDrawerMode("info");
        setSelectedId(leadId);
        void ensureLeadDetail(leadId);
      }
    } finally {
      clearOutreachBusy(leadId);
    }
  };

  const onLogCall = (leadId: string) => {
    setDrawerPromptNote("call");
    setDrawerMode("info");
    setSelectedId(leadId);
    void ensureLeadDetail(leadId);
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
    const prior = boardRef.current?.leads.find((l) => l.id === leadId);
    const droppedFollowUpIds = rememberDroppedFollowUps(
      prior,
      patch.followUps,
    );
    const droppedContactMethods = rememberDroppedContactMethods(
      prior,
      patch.contactMethods,
    );
    const writeAt = patchLeadLocal(
      leadId,
      {
        ...(patch as Partial<LeadWithOutreach>),
        ...(droppedFollowUpIds ? { droppedFollowUpIds } : {}),
        ...(droppedContactMethods ? { droppedContactMethods } : {}),
      },
      { pending: true },
    );
    try {
      await enqueueLeadWrite(leadId, async () => {
        const latest = boardRef.current?.leads.find((l) => l.id === leadId);
        const body: typeof patch = { ...patch };
        if (latest) {
          for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
            if (key === "followUps") body.followUps = latest.followUps;
            else if (key === "contactMethods") {
              body.contactMethods = latest.contactMethods;
            } else if (key === "crmStage") body.crmStage = latest.crmStage;
            else if (key === "emails") body.emails = latest.emails;
            else if (key === "phones") body.phones = latest.phones;
            else if (key === "company") body.company = latest.company;
            else if (key === "website") body.website = latest.website;
            else if (key === "location") body.location = latest.location;
            else if (key === "aboutBlurb") body.aboutBlurb = latest.aboutBlurb;
            else if (key === "notes") body.notes = latest.notes;
            else if (key === "companyType") {
              body.companyType = latest.companyType;
            } else if (key === "customFields") {
              body.customFields = latest.customFields;
            }
          }
        }
        const { lead } = await api.updateLead(leadId, body);
        applyServerLead(leadId, lead, body, writeAt);
      });
    } catch (e) {
      await refresh();
      toast("err", (e as Error).message);
    }
  };

  const clearNoteUndoTimer = () => {
    if (noteUndoTimerRef.current != null) {
      window.clearTimeout(noteUndoTimerRef.current);
      noteUndoTimerRef.current = null;
    }
  };

  const restoreDeletedNote = async (leadId: string, note: FollowUp) => {
    clearNoteUndoTimer();
    setNoteUndo(null);
    dismissToast(`undo-note-${note.id}`);
    const current =
      boardRef.current?.leads.find((l) => l.id === leadId)?.followUps ?? [];
    const updated = current.some((f) => f.id === note.id)
      ? current
      : [...current, note];
    await onUpdateLeadCrm(leadId, { followUps: updated });
  };

  const offerNoteUndo = (leadId: string, note: FollowUp) => {
    clearNoteUndoTimer();
    setNoteUndo({ leadId, note });
    toast("ok", "Note deleted.", 8000, `undo-note-${note.id}`, {
      label: "Undo",
      onClick: () => void restoreDeletedNote(leadId, note),
    });
    noteUndoTimerRef.current = window.setTimeout(() => {
      setNoteUndo(null);
      noteUndoTimerRef.current = null;
    }, 8000);
  };

  const cancelDraftAll = useCallback(() => {
    draftAbortRef.current?.abort();
  }, []);

  const onDraftAllOutreach = async (opts?: { redraft?: boolean }) => {
    if (!board) return;
    const redraft = Boolean(opts?.redraft);
    const targets = board.leads.filter(
      redraft ? canRedraftOutreach : needsOutreachDraft,
    );
    if (targets.length === 0) return;

    const ac = new AbortController();
    draftAbortRef.current = ac;
    markOutreachBusy("draft-all");
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
        if (!id) failed += 1;
        else ok += 1;
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
      const unit = `draft${ok === 1 ? "" : "s"}`;
      const verb = redraft ? "rewritten" : "moved to Ready to Contact";
      if (ac.signal.aborted) {
        toast(
          "ok",
          `Stopped — ${ok} ${unit} ${verb}${
            failed ? ` (${failed} failed)` : ""
          }.`,
        );
      } else if (failed === 0) {
        toast("ok", `${ok} ${unit} ${verb}.`);
      } else {
        toast(
          "err",
          `${ok} of ${targets.length} ${redraft ? "rewritten" : "drafted"} — ${failed} failed.`,
        );
      }
    } finally {
      clearOutreachBusy("draft-all");
      setDraftProgress(null);
      draftAbortRef.current = null;
    }
  };

  const ensureLeadDetail = useCallback(
    async (id: string) => {
      const cur = boardRef.current?.leads.find((l) => l.id === id);
      if (!cur || cur.detailLoaded !== false) return;
      const fetchStartedAt = performance.now();
      try {
        const { lead } = await api.getLead(id);
        setBoard((b) => {
          if (!b) return b;
          return {
            ...b,
            leads: b.leads.map((l) =>
              l.id === id
                ? mergeSlimIntoCached(
                    l,
                    { ...lead, detailLoaded: true },
                    { fetchStartedAt },
                  )
                : l,
            ),
          };
        });
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
    const all = omitDroppedLeadIds(
      board?.leads ?? [],
      droppedLeadIdsRef.current,
    );
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

  // Background geocode for the whole board — any studio page, not only Map.
  // Hash locations so CRM/status patches don’t cancel an in-flight prefetch.
  const geocodePrefetchKey = useMemo(() => {
    const leads = board?.leads ?? [];
    let h = leads.length >>> 0;
    for (const l of leads) {
      const s = l.location?.trim().toLowerCase() ?? "";
      for (let i = 0; i < s.length; i++) {
        h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
      }
    }
    return `${board?.activeBoardId ?? ""}|${board?.run?.location?.trim() ?? ""}|${h}`;
  }, [board?.activeBoardId, board?.leads, board?.run?.location]);

  useEffect(() => {
    if (!board?.leads.length) return;
    prefetchLeadGeocodes({
      locations: board.leads.map((l) => l.location),
      locationHint: board.run?.location ?? null,
    });
  }, [geocodePrefetchKey, board]);

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
      // Leave body mounted while the pane is sticky-hidden — don’t tear down.
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
  const searchHref = `/app${queryForView("board", filterBoardId)}`;
  const canSearchLive = board?.capabilities.canSearchLive ?? false;
  /** Pipeline / outreach / leads fill the shell; other views scroll inside it. */
  const fillViewport =
    view === "pipeline" ||
    view === "outreach" ||
    view === "leads" ||
    view === "calendar";
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
    view === "calendar" ||
    view === "runs";
  if (loading && !board && needsBoardPayload) {
    return <StudioViewSkeleton view={view} />;
  }

  const dropLeadsLocally = (ids: string[]) => {
    const idSet = new Set(ids);
    for (const id of ids) droppedLeadIdsRef.current.add(id);
    setSelectedId((cur) => (cur && idSet.has(cur) ? null : cur));
    setBoard((b) => {
      if (!b) return b;
      const removing = b.leads.filter((l) => idSet.has(l.id));
      const counts = b.crmStageCounts ? { ...b.crmStageCounts } : undefined;
      if (counts) {
        for (const l of removing) {
          const stage = l.crmStage ?? "new";
          counts[stage] = Math.max(0, (counts[stage] ?? 0) - 1);
        }
      }
      return {
        ...b,
        leads: b.leads.filter((l) => !idSet.has(l.id)),
        leadsTotal: Math.max(
          0,
          (b.leadsTotal ?? b.leads.length) - removing.length,
        ),
        ...(counts ? { crmStageCounts: counts } : {}),
      };
    });
  };

  const onDeleteLead = async (leadId: string) => {
    // Stop any in-flight CSV import so rows don’t reappear after delete.
    importAbortRef.current?.abort();
    dropLeadsLocally([leadId]);
    try {
      await api.deleteLead(leadId);
      toast("ok", "Lead deleted.");
    } catch (e) {
      droppedLeadIdsRef.current.delete(leadId);
      await refresh();
      toast("err", (e as Error).message);
    }
  };

  const onTakeControl = async () => {
    if (!filterBoardId || takingOver) return;
    setTakingOver(true);
    try {
      await api.takeoverBoardLock(filterBoardId);
      takeoverRef.current = true;
      setEditLocked(false);
      setLockHolder(null);
      toast("ok", "You have control of this board.");
    } catch (e) {
      takeoverRef.current = false;
      toast("err", (e as Error).message);
    } finally {
      setTakingOver(false);
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
    dropLeadsLocally(leadIds);
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
    } catch (e) {
      for (const id of leadIds) droppedLeadIdsRef.current.delete(id);
      await refresh();
      toast("err", (e as Error).message);
    } finally {
      setDeletingLeads(false);
      setDeleteProgress(null);
    }
  };

  const showVerifyMeter = Boolean(
    board?.capabilities.emailVerify &&
      board.workspace.emailVerifyEnabled !== false,
  );
  const showLeadsMeter = Boolean(
    board?.workspace &&
      (board.workspace.planId !== "insider" ||
        board.workspace.firecrawlCreditsRemaining != null),
  );
  const meterCount = (showLeadsMeter ? 1 : 0) + (showVerifyMeter ? 1 : 0);

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
                        : view === "calendar"
                          ? "Calendar"
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
            {editLocked && filterBoardId ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-aurora-400/25 bg-aurora-400/10 py-1 pl-2.5 pr-1 text-xs text-mist-200">
                <span
                  className="pulse-ring h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-400"
                  aria-hidden
                />
                <span className="font-medium text-aurora-200">Live</span>
                <span className="max-w-[9rem] truncate text-mist-400">
                  {lockHolder ?? "Someone else"}
                </span>
                <button
                  type="button"
                  onClick={() => void onTakeControl()}
                  disabled={takingOver}
                  aria-label={`Take control of this board from ${lockHolder ?? "the other editor"}`}
                  className="rounded-full bg-aurora-400/20 px-2.5 py-1 font-medium text-aurora-100 transition-colors hover:bg-aurora-400/30 disabled:opacity-50"
                >
                  {takingOver ? "Taking…" : "Take control"}
                </button>
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-mist-500">
            {view === "dashboard"
              ? "Overview of leads and activity across your boards."
              : view === "boards"
                ? "Named lists for campaigns or niches. Invite collaborators; take control if someone else is live."
                : view === "pipeline"
                  ? "Drag leads between stages as conversations progress."
                  : view === "leads"
                    ? "All prospects on this board — filter, edit, and export."
                    : view === "outreach"
                      ? "Draft and send outreach one lead at a time."
                      : view === "calendar"
                        ? "Follow-ups, emails sent, and phone calls — day by day."
                      : view === "runs"
                        ? "History of searches in this workspace."
                        : view === "admin"
                          ? "Cross-workspace health — workspaces, usage, and billing signals."
                          : view === "admin-users"
                            ? "Plan, usage, and send setup across workspaces."
                            : "Find prospects by niche and location."}
          </p>
        </div>

        {view !== "dashboard" &&
        view !== "boards" &&
        view !== "admin" &&
        view !== "admin-users" &&
        board?.workspace &&
        meterCount > 0 ? (
          <div className="flex min-w-0 max-w-md flex-col gap-1 justify-self-stretch sm:min-w-[16rem] sm:justify-self-center sm:min-w-[22rem]">
            <div
              className={`grid gap-4 ${
                meterCount > 1 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {showLeadsMeter && board.workspace.planId === "insider" ? (
                <UsageBar
                  label="Leads"
                  title="Firecrawl credits"
                  remaining={
                    board.workspace.firecrawlCreditsRemaining ?? undefined
                  }
                />
              ) : showLeadsMeter ? (
                <UsageBar
                  label="Leads"
                  used={board.workspace.leadsUsed}
                  limit={board.workspace.leadsLimit}
                />
              ) : null}
              {showVerifyMeter ? (
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
            <div className="flex h-9 shrink-0 flex-nowrap items-center justify-end gap-2">
              {view === "outreach" ? (
                <TypeFilterMenu
                  value={outreachTypeFilter}
                  options={outreachCompanyTypes}
                  onChange={setOutreachTypeFilter}
                />
              ) : null}
              <label className="relative inline-flex h-full w-44 shrink-0 items-center sm:w-56">
                <span className="sr-only">Search leads</span>
                <input
                  type="search"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Search leads…"
                  className="h-full w-full rounded-xl border border-white/10 bg-ink-900/60 py-0 pl-3 pr-3 text-sm text-mist-100 outline-none placeholder:text-mist-600 focus:border-aurora-400/50"
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
                const list = boards.length ? boards : board?.boards ?? [];
                const preferred =
                  (filterBoardId && list.some((b) => b.id === filterBoardId)
                    ? filterBoardId
                    : null) ?? list[0]?.id ?? null;
                if (preferred) {
                  try {
                    await executeImport(leads, { boardId: preferred });
                  } catch (e) {
                    handleError(e);
                  }
                  return;
                }
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
      {(view === "pipeline" || visitedSticky.has("pipeline")) && (
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
          ) : !hasLeads ? (
            <EmptyState actionHref={searchHref} />
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

      {/* All leads — kept mounted after first visit (filters / sort / scroll) */}
      {(view === "leads" || visitedSticky.has("leads")) && (
        <div
          data-tour="leads-table"
          className={
            view === "leads"
              ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
              : "hidden"
          }
          aria-hidden={view !== "leads"}
        >
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
              <EmptyState actionHref={searchHref} />
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
                      boardId={board.activeBoardId}
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
      {(view === "outreach" || visitedSticky.has("outreach")) && (
        <div
          className={view === "outreach" ? "min-h-0 flex-1" : "hidden"}
          aria-hidden={view !== "outreach"}
        >
          {loading || leadsHydrating || !board ? (
            <div role="status" aria-busy="true" aria-label="Loading outreach">
              <OutreachSkeleton />
            </div>
          ) : !hasLeads ? (
            <EmptyState actionHref={searchHref} />
          ) : (
            <OutreachView
              key={filterBoardId ?? "all"}
              leads={outreachFilteredLeads}
              sendsToday={board.workspace.sendsToday ?? 0}
              warmupScopeId={
                board.boards.find((b) => b.id === board.activeBoardId)
                  ?.outreachProfileId ?? board.activeBoardId
              }
              canSendEmail={!!board.capabilities.canSendEmail}
              busyIds={outreachBusyIds}
              backfilling={leadsBackfilling}
              loadedCount={board.leads.length}
              totalCount={board.leadsTotal ?? board.leads.length}
              onOpenInfo={openInfo}
              onOpenDraft={openDraft}
              onCreateDraft={createAndOpenDraft}
              onSend={(outreachId) => {
                // Non-blocking: verify/send continue while user works other leads.
                void requestSend(outreachId);
              }}
              onDraftAll={onDraftAllOutreach}
              onMarkContacted={onMarkContacted}
              onLogCall={onLogCall}
            />
          )}
        </div>
      )}

      {/* Calendar — follow-ups, sends, and calls by day */}
      {view === "calendar" && (
        <div className="flex min-h-0 flex-1 flex-col pb-6">
          {loading || leadsHydrating || !board ? (
            <div role="status" aria-busy="true" aria-label="Loading calendar">
              <CalendarSkeleton />
            </div>
          ) : !hasLeads ? (
            <EmptyState actionHref={searchHref} actionLabel="Find leads to follow up" />
          ) : (
            <CalendarView
              leads={board.leads}
              onOpenLead={openInfo}
              onToggleFollowUp={(leadId, fuId, done) => {
                const lead = board.leads.find((l) => l.id === leadId);
                if (!lead) return;
                const followUps = (lead.followUps ?? []).map((f) =>
                  f.id === fuId ? { ...f, done } : f,
                );
                void onUpdateLeadCrm(leadId, { followUps });
              }}
            />
          )}
        </div>
      )}

      {/* Runs view */}
      {view === "runs" && (
        <RunsView
          activeRunId={activeRunId ?? board?.run?.id ?? null}
          onOpenRun={(runId) => {
            activeRunIdRef.current = runId;
            setActiveRunId(runId);
            setView("leads");
            void refresh({ forceFull: true }).catch((e) =>
              toast("err", (e as Error).message),
            );
          }}
        />
      )}
      </div>

      {selected && board && (
        <LeadDrawer
          lead={selected}
          mode={drawerMode}
          promptNote={drawerPromptNote}
          actorName={actorName}
          capabilities={board.capabilities}
          onClose={closeLeadDrawer}
          onUndoMarkContacted={
            drawerPromptNote && (selected.crmStage ?? "new") !== "new"
              ? () => onUndoMarkContacted(selected.id)
              : undefined
          }
          onPromptNoteDone={() => setDrawerPromptNote(false)}
          onDraft={onDraft}
          onSaveDraft={onSaveDraft}
          onSend={requestSend}
          onSetDelivery={onSetDelivery}
          onUpdateCrm={onUpdateLeadCrm}
          deletedNote={
            noteUndo && selected.id === noteUndo.leadId ? noteUndo.note : null
          }
          onNoteDeleted={(note) => offerNoteUndo(selected.id, note)}
          onUndoDeletedNote={() => {
            if (!noteUndo) return;
            void restoreDeletedNote(noteUndo.leadId, noteUndo.note);
          }}
          onDeleteLead={
            editLocked
              ? undefined
              : async (id) => {
                  closeLeadDrawer();
                  await onDeleteLead(id);
                }
          }
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
        open={!!verifyWarn}
        onClose={() => setVerifyWarn(null)}
        title="Verifier unsure"
        className="max-w-md border-amber-400/20"
      >
        {verifyWarn ? (
          <>
            {verifyWarn.email ? (
              <p className="mb-2 break-all font-mono text-sm text-mist-100">
                {verifyWarn.email}
              </p>
            ) : null}
            <p className="text-sm text-mist-300">{verifyWarn.message}</p>
            {verifyWarn.reason ? (
              <p className="mt-2 text-xs text-mist-500">
                Provider detail: {verifyWarn.reason}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-mist-500">
              MyEmailVerifier often flags working info@ / SMB addresses as
              Invalid — delivered mail means it was a false positive.
            </p>
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

      {/* Toasts — portaled so overflow-hidden main / drawer overlay cannot hide Undo */}
      {toastHost
        ? createPortal(
            <div
              className="pointer-events-none fixed bottom-6 left-6 z-[2000] flex flex-col gap-2"
              role="status"
              aria-live="polite"
            >
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={`animate-float-up pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-xl ring-1 ${
                    t.kind === "ok"
                      ? "bg-ink-800 text-aurora-200 ring-aurora-400/25"
                      : "bg-ink-800 text-rose-200 ring-rose-400/30"
                  }`}
                >
                  {t.kind === "ok" ? (
                    <CheckIcon className="h-4 w-4 shrink-0" />
                  ) : (
                    <span>⚠</span>
                  )}
                  <span className="min-w-0">{t.text}</span>
                  {t.actionLabel && t.onAction ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-full bg-aurora-400/20 px-2.5 py-1 text-xs font-medium text-aurora-100 hover:bg-aurora-400/30"
                      onClick={() => {
                        t.onAction?.();
                        dismissToast(t.id);
                      }}
                    >
                      {t.actionLabel}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>,
            toastHost,
          )
        : null}
    </main>
  );
}

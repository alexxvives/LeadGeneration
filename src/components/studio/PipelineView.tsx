"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ContactMethod, CrmStage, LeadWithOutreach } from "@/lib/types";
import { MailIcon, PhoneIcon, FormIcon, InstagramIcon, WhatsAppIcon, GlobeIcon, InfoIcon, CalendarIcon, StarIcon } from "@/components/icons";
import {
  isUserFollowUp,
  leadHasMissedCall,
  resolveFollowUpKind,
} from "@/lib/follow-ups";
import { Bone, useStableDuringLoad } from "./skeletons";
import { VirtualColumnList } from "./virtual-list";
import { useBoardLockUi } from "./board-lock";

// ─── CRM Pipeline columns ────────────────────────────────────────────────────

const MAIN_COLUMNS: {
  stage: CrmStage;
  title: string;
  empty: string;
  color: string;
}[] = [
  {
    stage: "new",
    title: "New",
    empty: "No untouched leads — run a search to add more.",
    color: "bg-mist-500",
  },
  {
    stage: "contacted",
    title: "Contacted",
    empty: "Send an email or drag a card here.",
    color: "bg-amber-400",
  },
  {
    stage: "in_conversation",
    title: "In Conversation",
    empty: "Replies land here from email webhooks.",
    color: "bg-sky-400",
  },
  {
    stage: "closed",
    title: "Closed",
    empty: "Move here when you close the deal.",
    color: "bg-aurora-300",
  },
];

const PARKED_COLUMNS: {
  stage: CrmStage;
  title: string;
  empty: string;
  color: string;
}[] = [
  {
    stage: "not_interested",
    title: "Not Interested",
    empty: "Move here when they decline.",
    color: "bg-rose-400",
  },
];

const ALL_STAGE_TABS = [...MAIN_COLUMNS, ...PARKED_COLUMNS];

const TAB_SHORT: Record<CrmStage, string> = {
  new: "New",
  contacted: "Contacted",
  in_conversation: "In convo",
  closed: "Closed",
  not_interested: "Not interested",
};

// ─── Pipeline (CRM kanban with drag-and-drop) ─────────────────────────────────

function compareColumnLeads(stage: CrmStage) {
  return (a: LeadWithOutreach, b: LeadWithOutreach) => {
    if (stage === "contacted") {
      const aSent = a.outreach?.sentAt ?? "";
      const bSent = b.outreach?.sentAt ?? "";
      if (aSent !== bSent) return bSent.localeCompare(aSent);
    }
    return a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
  };
}

function useStageLeads(
  allLeads: LeadWithOutreach[],
  stage: CrmStage,
  backfilling: boolean,
): LeadWithOutreach[] {
  const raw = useMemo(
    () => allLeads.filter((l) => l.crmStage === stage),
    [allLeads, stage],
  );
  const compare = useCallback(compareColumnLeads(stage), [stage]);
  return useStableDuringLoad(raw, compare, backfilling);
}

function MainStageColumn({
  col,
  allLeads,
  stageCount,
  backfilling,
  filterActive,
  onOpen,
  activeId,
}: {
  col: (typeof MAIN_COLUMNS)[number];
  allLeads: LeadWithOutreach[];
  stageCount?: number;
  backfilling: boolean;
  filterActive: boolean;
  onOpen: (id: string) => void;
  activeId: string | null;
}) {
  const colLeads = useStageLeads(allLeads, col.stage, backfilling);
  return (
    <PipelineColumn
      col={col}
      leads={colLeads}
      count={filterActive ? colLeads.length : (stageCount ?? colLeads.length)}
      backfilling={backfilling}
      filterActive={filterActive}
      onOpen={onOpen}
      activeId={activeId}
    />
  );
}

function ParkedStageColumn({
  col,
  allLeads,
  stageCount,
  backfilling,
  filterActive,
  open,
  onToggle,
  onOpen,
  activeId,
}: {
  col: (typeof PARKED_COLUMNS)[number];
  allLeads: LeadWithOutreach[];
  stageCount?: number;
  backfilling: boolean;
  filterActive: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  activeId: string | null;
}) {
  const colLeads = useStageLeads(allLeads, col.stage, backfilling);
  return (
    <ParkedStage
      col={col}
      leads={colLeads}
      count={filterActive ? colLeads.length : (stageCount ?? colLeads.length)}
      filterActive={filterActive}
      open={open}
      onToggle={onToggle}
      onOpen={onOpen}
      activeId={activeId}
    />
  );
}

export function PipelineView({
  leads,
  stageCounts,
  backfilling = false,
  filterActive = false,
  onOpen,
  onMoveStage,
}: {
  leads: LeadWithOutreach[];
  /** DB totals — column badges stay honest while leads are still paging in. */
  stageCounts?: Record<CrmStage, number>;
  /** While true, new cards append at column bottoms (no top pop-in). */
  backfilling?: boolean;
  /** Search is filtering — don't treat empty columns as still paging. */
  filterActive?: boolean;
  onOpen: (id: string) => void;
  onMoveStage: (
    leadId: string,
    stage: CrmStage,
    contactMethods?: ContactMethod[] | null,
  ) => void;
}) {
  const { locked: editLocked, holder } = useBoardLockUi();
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragStartedRef = useRef(false);
  const [parkedOpen, setParkedOpen] = useState<Record<string, boolean>>({
    not_interested: false,
  });
  const [narrowStage, setNarrowStage] = useState<CrmStage>("new");

  // Distance for pointer; keyboard for a11y. Touch can scroll columns (no touch-none).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    if (editLocked) return;
    dragStartedRef.current = true;
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    // Suppress the trailing click that browsers fire after a drag.
    window.setTimeout(() => {
      dragStartedRef.current = false;
    }, 0);
    if (editLocked) return;
    const { active, over } = event;
    if (!over) return;
    const lead = leads.find((l) => l.id === active.id);
    const newStage = over.id as CrmStage;
    if (!lead || lead.crmStage === newStage) return;
    onMoveStage(String(active.id), newStage);
  }

  const openIfClick = (id: string) => {
    if (dragStartedRef.current) return;
    onOpen(id);
  };

  const narrowCol =
    ALL_STAGE_TABS.find((c) => c.stage === narrowStage) ?? MAIN_COLUMNS[0]!;
  const narrowLeads = useStageLeads(leads, narrowCol.stage, backfilling);
  const narrowCount = filterActive
    ? narrowLeads.length
    : (stageCounts?.[narrowCol.stage] ?? narrowLeads.length);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="shrink-0 text-xs uppercase tracking-widest text-mist-500">
        <span className="font-semibold text-mist-200">{leads.length}</span> lead
        {leads.length === 1 ? "" : "s"}
        {editLocked
          ? ` · ${holder ?? "Someone else"} is editing — take control to move stages`
          : (
            <>
              <span className="hidden lg:inline"> · drag to change stage</span>
              <span className="lg:hidden"> · move to change stage</span>
            </>
          )}
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:hidden">
        <div
          className="flex shrink-0 flex-wrap gap-1"
          role="tablist"
          aria-label="Pipeline stage"
          data-testid="pipeline-stage-tabs"
        >
          {ALL_STAGE_TABS.map((col) => {
            const count = filterActive
              ? leads.filter((l) => l.crmStage === col.stage).length
              : (stageCounts?.[col.stage] ??
                leads.filter((l) => l.crmStage === col.stage).length);
            const active = narrowStage === col.stage;
            return (
              <button
                key={col.stage}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setNarrowStage(col.stage)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
                  active
                    ? "bg-aurora-400 text-on-accent"
                    : "border border-white/10 bg-ink-900/60 text-mist-300 hover:text-mist-100"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${col.color} ${active ? "ring-1 ring-ink-950/40" : ""}`} />
                {TAB_SHORT[col.stage]}
                <span className="tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl2 border border-white/10 bg-ink-950/40">
          {narrowLeads.length === 0 ? (
            backfilling && !filterActive && narrowCount > 0 ? (
              <div
                className="flex flex-col gap-2 p-3"
                role="status"
                aria-busy="true"
                aria-label={`Loading ${narrowCol.title} leads`}
              >
                {Array.from({ length: Math.min(3, narrowCount) }, (_, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/8 bg-ink-950/50 p-3"
                  >
                    <Bone className="h-4 w-3/4 max-w-[12rem]" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-2 py-6 text-center text-xs leading-relaxed text-mist-500">
                {filterActive ? "No matching leads." : narrowCol.empty}
              </p>
            )
          ) : (
            <VirtualColumnList
              items={narrowLeads}
              estimateSize={72}
              padding={12}
              gap={8}
              renderItem={(l) => (
                <NarrowPipelineCard
                  lead={l}
                  onOpen={onOpen}
                  onMoveStage={onMoveStage}
                />
              )}
            />
          )}
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 flex-col gap-3 lg:flex">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div
            className="grid min-h-0 flex-1 gap-3 overflow-x-auto pb-1"
            style={{
              gridTemplateColumns: `repeat(${MAIN_COLUMNS.length}, minmax(9rem, 1fr))`,
            }}
          >
            {MAIN_COLUMNS.map((col) => (
              <MainStageColumn
                key={col.stage}
                col={col}
                allLeads={leads}
                stageCount={stageCounts?.[col.stage]}
                backfilling={backfilling}
                filterActive={filterActive}
                onOpen={openIfClick}
                activeId={activeId}
              />
            ))}
          </div>

          <div className="grid shrink-0 gap-2 sm:grid-cols-1">
            {PARKED_COLUMNS.map((col) => (
              <ParkedStageColumn
                key={col.stage}
                col={col}
                allLeads={leads}
                stageCount={stageCounts?.[col.stage]}
                backfilling={backfilling}
                filterActive={filterActive}
                open={parkedOpen[col.stage] ?? false}
                onToggle={() =>
                  setParkedOpen((prev) => ({
                    ...prev,
                    [col.stage]: !prev[col.stage],
                  }))
                }
                onOpen={openIfClick}
                activeId={activeId}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeLead ? (
            <div className="w-60 rotate-2 cursor-grabbing rounded-xl border border-aurora-400/40 bg-ink-800 px-3 py-3 shadow-2xl">
              <p className="truncate text-sm font-medium text-mist-100">{activeLead.company}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      </div>
    </div>
  );
}

function ParkedStage({
  col,
  leads,
  count,
  filterActive,
  open,
  onToggle,
  onOpen,
  activeId,
}: {
  col: (typeof PARKED_COLUMNS)[number];
  leads: LeadWithOutreach[];
  count: number;
  filterActive: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl2 border transition-colors ${
        isOver
          ? "border-aurora-400/40 bg-aurora-400/5"
          : "border-white/10 bg-ink-950/40"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex min-h-[2.75rem] w-full shrink-0 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] sm:px-4 ${
          open ? "border-b border-white/5" : ""
        }`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${col.color}`} />
        <span className="truncate text-sm font-semibold leading-none text-mist-100">
          {col.title}
        </span>
        <span className="ml-auto font-display text-lg leading-none tabular-nums text-aurora-300">
          {count}
        </span>
        <span className="text-xs text-mist-600">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="max-h-[28vh] min-h-0">
          {leads.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-mist-500">
              {filterActive ? "No matching leads." : col.empty}
            </p>
          ) : (
            <VirtualColumnList
              items={leads}
              estimateSize={72}
              padding={12}
              gap={8}
              className="max-h-[28vh]"
              renderItem={(l) => (
                <DraggablePipelineCard
                  lead={l}
                  onOpen={onOpen}
                  isDragging={l.id === activeId}
                />
              )}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function PipelineColumn({
  col,
  leads,
  count,
  backfilling,
  filterActive,
  onOpen,
  activeId,
}: {
  col: (typeof MAIN_COLUMNS)[number] | (typeof PARKED_COLUMNS)[number];
  leads: LeadWithOutreach[];
  count: number;
  backfilling: boolean;
  filterActive: boolean;
  onOpen: (id: string) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-0 min-w-0 flex-col rounded-xl2 border transition-colors ${
        isOver ? "border-aurora-400/40 bg-aurora-400/5" : "border-white/10 bg-ink-950/40"
      }`}
    >
      <div className="flex min-h-[2.75rem] shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2.5 sm:px-4">
        <span className={`h-2 w-2 shrink-0 rounded-full ${col.color}`} />
        <h3 className="truncate text-sm font-semibold leading-none text-mist-100">{col.title}</h3>
        <span className="ml-auto font-display text-lg leading-none tabular-nums text-aurora-300">
          {count}
        </span>
      </div>
      {leads.length === 0 ? (
          backfilling && !filterActive && count > 0 ? (
            <div
              className="flex flex-col gap-2 p-3"
              role="status"
              aria-busy="true"
              aria-label={`Loading ${col.title} leads`}
            >
              {Array.from({ length: Math.min(3, count) }, (_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/8 bg-ink-950/50 p-3"
                >
                  <Bone className="h-4 w-3/4 max-w-[12rem]" />
                </div>
              ))}
            </div>
          ) : (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-mist-500">
              {filterActive ? "No matching leads." : col.empty}
            </p>
          )
        ) : (
          <VirtualColumnList
            items={leads}
            estimateSize={64}
            padding={12}
            gap={8}
            renderItem={(l) => (
              <DraggablePipelineCard
                lead={l}
                onOpen={onOpen}
                isDragging={l.id === activeId}
              />
            )}
          />
        )}
    </div>
  );
}

function MethodIcons({ methods }: { methods: ContactMethod[] }) {
  return (
    <>
      {methods.includes("email") && <MailIcon className="h-2.5 w-2.5" />}
      {methods.includes("phone") && <PhoneIcon className="h-2.5 w-2.5" />}
      {methods.includes("contact_form") && <FormIcon className="h-2.5 w-2.5" />}
      {methods.includes("instagram") && <InstagramIcon className="h-2.5 w-2.5" />}
      {methods.includes("whatsapp") && <WhatsAppIcon className="h-2.5 w-2.5" />}
      {methods.includes("organic") && <GlobeIcon className="h-2.5 w-2.5" />}
    </>
  );
}

function NarrowPipelineCard({
  lead,
  onOpen,
  onMoveStage,
}: {
  lead: LeadWithOutreach;
  onOpen: (id: string) => void;
  onMoveStage: (
    leadId: string,
    stage: CrmStage,
    contactMethods?: ContactMethod[] | null,
  ) => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  return (
    <PipelineCardFace
      lead={lead}
      onOpen={onOpen}
      hideInfo
      extra={
        <label className="shrink-0">
          <span className="sr-only">Move {lead.company} to stage</span>
          <select
            value={lead.crmStage ?? "new"}
            disabled={editLocked}
            title={editLocked ? lockHint : "Move to stage"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = e.target.value as CrmStage;
              if (next === lead.crmStage) return;
              onMoveStage(lead.id, next);
            }}
            className="h-7 max-w-[6.25rem] rounded-md border border-white/10 bg-ink-900/70 px-1.5 text-[10px] font-medium text-mist-300 outline-none focus:border-aurora-400/50 disabled:opacity-50"
          >
            {ALL_STAGE_TABS.map((col) => (
              <option key={col.stage} value={col.stage}>
                {col.title}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
}

function pipelineCardChrome(lead: LeadWithOutreach) {
  const pendingFollowUps =
    lead.followUps?.filter((f) => isUserFollowUp(f) && !f.done).length ?? 0;
  const journalNotes =
    lead.followUps?.filter((f) => resolveFollowUpKind(f) === "note").length ?? 0;
  const noteCount = journalNotes > 0 ? journalNotes : lead.notes?.trim() ? 1 : 0;
  const replied = lead.outreach?.deliveryStatus === "replied";
  const methods = lead.contactMethods ?? [];
  const missedCall = leadHasMissedCall(lead);
  const iconMethods: ContactMethod[] =
    missedCall && !methods.includes("phone")
      ? [...methods, "phone"]
      : methods;
  const needsMethod = lead.crmStage === "contacted" && methods.length === 0;
  return { pendingFollowUps, noteCount, replied, methods, missedCall, iconMethods, needsMethod };
}

function PipelineCardFace({
  lead,
  onOpen,
  className = "",
  extra,
  hideInfo = false,
}: {
  lead: LeadWithOutreach;
  onOpen: (id: string) => void;
  className?: string;
  extra?: ReactNode;
  hideInfo?: boolean;
}) {
  const { pendingFollowUps, noteCount, replied, methods, missedCall, iconMethods, needsMethod } =
    pipelineCardChrome(lead);

  return (
    <div
      onClick={() => onOpen(lead.id)}
      data-testid={hideInfo ? "pipeline-lead-card" : undefined}
      className={`group flex h-auto cursor-pointer items-start gap-1 rounded-xl px-3 py-2.5 transition-all ${
        replied
          ? "border border-sky-400/50 bg-sky-400/10 shadow-[0_0_0_1px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/30 hover:bg-sky-400/15"
          : needsMethod
            ? "border border-amber-400/50 bg-amber-400/10 ring-1 ring-amber-400/30 hover:bg-amber-400/15"
            : "border border-white/5 bg-ink-900/60 hover:bg-white/[0.03]"
      } ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {replied ? (
            <span
              className="pulse-ring relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400"
              aria-hidden
            />
          ) : needsMethod ? (
            <span
              className="pulse-ring relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              aria-hidden
            />
          ) : null}
          <p className="truncate text-sm font-medium leading-snug text-mist-100">
            {lead.company}
          </p>
          {lead.waitingOnUs ? (
            <StarIcon
              className="h-3 w-3 shrink-0 text-amber-300"
              aria-label="Waiting on us"
            />
          ) : null}
        </div>
        <div className="mt-1.5 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
          {pendingFollowUps > 0 ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-400/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300"
              title={
                pendingFollowUps === 1
                  ? "Pending follow-up"
                  : `${pendingFollowUps} pending follow-ups`
              }
            >
              <CalendarIcon className="h-2.5 w-2.5" />
              {pendingFollowUps === 1
                ? "Follow-up"
                : `${pendingFollowUps} follow-ups`}
            </span>
          ) : null}
          {noteCount > 0 ? (
            <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              {noteCount} note{noteCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {(lead.crmStage !== "new" || missedCall) && iconMethods.length > 0 ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-800/80 px-1.5 py-0.5 text-[10px] font-medium text-mist-300 ring-1 ring-ink-600/40"
              title={
                missedCall && !methods.includes("phone")
                  ? ["missed call", ...methods].filter(Boolean).join(", ")
                  : iconMethods.join(", ")
              }
            >
              <MethodIcons methods={iconMethods} />
            </span>
          ) : null}
          {replied ? (
            <span className="shrink-0 rounded-full bg-sky-400/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
              Replied
            </span>
          ) : null}
          {needsMethod ? (
            <span className="shrink-0 rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
              How contacted?
            </span>
          ) : null}
        </div>
      </div>

      {extra || !hideInfo ? (
        <div className="flex shrink-0 items-center gap-1">
          {extra}
          {hideInfo ? null : (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(lead.id);
              }}
              aria-label={
                needsMethod
                  ? `Set how you contacted ${lead.company}`
                  : `Lead info for ${lead.company}`
              }
              title={needsMethod ? "How contacted? Open to set method" : "Lead info"}
              className={`rounded-md p-1 transition-colors ${
                needsMethod
                  ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-400/30"
                  : "text-mist-500 hover:bg-white/10 hover:text-mist-100"
              }`}
            >
              <InfoIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DraggablePipelineCard({
  lead,
  onOpen,
  isDragging,
}: {
  lead: LeadWithOutreach;
  onOpen: (id: string) => void;
  isDragging: boolean;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: lead.id,
    disabled: editLocked,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(editLocked ? {} : listeners)}
      title={editLocked ? lockHint : undefined}
      className={`${
        editLocked ? "cursor-not-allowed" : "cursor-grab touch-pan-y active:cursor-grabbing"
      } ${isDragging ? "opacity-30" : ""}`}
    >
      <PipelineCardFace lead={lead} onOpen={onOpen} />
    </div>
  );
}

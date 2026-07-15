"use client";

import { useState } from "react";
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
import type { CrmStage, LeadWithOutreach } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { ArrowIcon, CheckIcon, SparkIcon, MailIcon, PhoneIcon, FormIcon } from "@/components/icons";

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
    empty: "Send an approved email or drag a card here.",
    color: "bg-amber-400",
  },
  {
    stage: "in_conversation",
    title: "In Conversation",
    empty: "Move here when they reply.",
    color: "bg-sky-400",
  },
  {
    stage: "closed",
    title: "Closed",
    empty: "Move here when you close the deal.",
    color: "bg-aurora-300",
  },
];

const NOT_INTERESTED_COL = {
  stage: "not_interested" as const,
  title: "Not Interested",
  empty: "Move here when they decline.",
  color: "bg-rose-400",
};

const ALL_COLUMNS = [...MAIN_COLUMNS, NOT_INTERESTED_COL];

const NEXT_CRM_STAGE: Partial<Record<CrmStage, CrmStage>> = {
  new: "contacted",
  contacted: "in_conversation",
  in_conversation: "closed",
};

// ─── Pipeline (CRM kanban with drag-and-drop) ─────────────────────────────────

export function PipelineView({
  leads,
  onOpen,
  onMoveStage,
  onDraft,
  onDecide,
}: {
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  onDraft: (leadId: string) => Promise<void>;
  onDecide: (outreachId: string, decision: "approved" | "rejected") => Promise<void>;
}) {
  const [draftingAll, setDraftingAll] = useState(false);
  const [approvingSelected, setApprovingSelected] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const queuedLeads = leads.filter((l) => l.status === "queued" && l.outreach);
  const undraftedLeads = leads.filter((l) => l.status === "new" && !l.outreach && l.emails.length > 0);
  const lostLeads = leads.filter((l) => l.crmStage === "not_interested");
  const selectedQueued = queuedLeads.filter((l) => selectedIds.has(l.id));

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
    if (newStage === "not_interested" && !lostOpen) setLostOpen(true);
  }

  const toggleSelect = (leadId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const draftAll = async () => {
    setDraftingAll(true);
    for (const l of undraftedLeads) await onDraft(l.id);
    setDraftingAll(false);
  };

  const approveSelected = async () => {
    const targets = selectedQueued.length > 0 ? selectedQueued : queuedLeads;
    setApprovingSelected(true);
    for (const l of targets) {
      if (l.outreach) await onDecide(l.outreach.id, "approved");
    }
    setSelectedIds(new Set());
    setApprovingSelected(false);
  };

  const newHeaderActions = (
    <>
      {undraftedLeads.length > 0 && (
        <button
          type="button"
          onClick={() => void draftAll()}
          disabled={draftingAll}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100 disabled:opacity-50"
        >
          {draftingAll ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3 w-3 text-aurora-300" />}
          Draft all ({undraftedLeads.length})
        </button>
      )}
      {queuedLeads.length > 0 && (
        <button
          type="button"
          onClick={() => void approveSelected()}
          disabled={approvingSelected}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100 disabled:opacity-50"
        >
          {approvingSelected ? <Spinner className="h-3 w-3" /> : <CheckIcon className="h-3 w-3 text-aurora-300" />}
          {selectedQueued.length > 0
            ? `Approve selected (${selectedQueued.length})`
            : `Approve all (${queuedLeads.length})`}
        </button>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-widest text-mist-500">
        <span className="font-semibold text-mist-200">{leads.length}</span> lead
        {leads.length === 1 ? "" : "s"} · drag to move between stages
        {queuedLeads.length > 0 && (
          <span className="normal-case tracking-normal text-mist-600">
            {" "}
            · tick cards to approve selected
          </span>
        )}
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${MAIN_COLUMNS.length}, minmax(0, 1fr))` }}
        >
          {MAIN_COLUMNS.map((col) => {
            const colLeads = leads.filter((l) => l.crmStage === col.stage);
            return (
              <PipelineColumn
                key={col.stage}
                col={col}
                leads={colLeads}
                onOpen={onOpen}
                onMoveStage={onMoveStage}
                activeId={activeId}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                headerActions={col.stage === "new" ? newHeaderActions : null}
              />
            );
          })}
        </div>

        <NotInterestedSection
          open={lostOpen}
          onToggle={() => setLostOpen((o) => !o)}
          leads={lostLeads}
          onOpen={onOpen}
          onMoveStage={onMoveStage}
          activeId={activeId}
        />

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
  headerActions,
  selectedIds,
  onToggleSelect,
}: {
  col: (typeof MAIN_COLUMNS)[number] | typeof NOT_INTERESTED_COL;
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  activeId: string | null;
  headerActions?: React.ReactNode;
  selectedIds?: Set<string>;
  onToggleSelect?: (leadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl2 border transition-colors ${
        isOver ? "border-aurora-400/40 bg-aurora-400/5" : "border-white/10 bg-ink-950/40"
      }`}
    >
      <div className="flex min-h-[2.75rem] items-center gap-2 border-b border-white/5 px-3 py-2.5 sm:px-4">
        <span className={`h-2 w-2 shrink-0 rounded-full ${col.color}`} />
        <h3 className="truncate text-sm font-semibold leading-none text-mist-100">{col.title}</h3>
        {headerActions && (
          <div className="flex shrink-0 items-center gap-1">{headerActions}</div>
        )}
        <span className="ml-auto font-display text-lg leading-none tabular-nums text-aurora-300">
          {leads.length}
        </span>
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
              selectable={l.status === "queued" && !!l.outreach}
              selected={selectedIds?.has(l.id) ?? false}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NotInterestedSection({
  open,
  onToggle,
  leads,
  onOpen,
  onMoveStage,
  activeId,
}: {
  open: boolean;
  onToggle: () => void;
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "not_interested" });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl2 border transition-colors ${
        isOver ? "border-rose-400/40 bg-rose-400/5" : "border-white/10 bg-ink-950/30"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
        aria-expanded={open}
      >
        <span className={`h-2 w-2 rounded-full ${NOT_INTERESTED_COL.color}`} />
        <span className="text-sm font-semibold text-mist-100">{NOT_INTERESTED_COL.title}</span>
        <span className="font-display text-base tabular-nums text-mist-400">{leads.length}</span>
        <span className="ml-auto text-xs text-mist-500">
          {open ? "Hide" : "Show"} · drop here to park
        </span>
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 text-mist-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path fill="currentColor" d="M2.5 4.5L6 8l3.5-3.5H2.5z" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/5 p-3">
          {leads.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-mist-500">{NOT_INTERESTED_COL.empty}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {leads.map((l) => (
                <DraggablePipelineCard
                  key={l.id}
                  lead={l}
                  onOpen={onOpen}
                  onMoveStage={onMoveStage}
                  isDragging={l.id === activeId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DraggablePipelineCard({
  lead,
  onOpen,
  onMoveStage,
  isDragging,
  selectable,
  selected,
  onToggleSelect,
}: {
  lead: LeadWithOutreach;
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  isDragging: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (leadId: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });
  const pendingFollowUps = lead.followUps?.filter((f) => !f.done).length ?? 0;
  const nextStage = lead.crmStage ? NEXT_CRM_STAGE[lead.crmStage] : undefined;
  const subtitle = lead.tags[0] ?? lead.emails[0] ?? lead.website ?? null;
  const showMeta =
    pendingFollowUps > 0 || !!lead.contactMethod;

  return (
    <div
      ref={setNodeRef}
      className={`group rounded-xl border border-white/5 bg-ink-900/60 transition-opacity ${
        isDragging ? "opacity-30" : ""
      } ${selected ? "ring-1 ring-aurora-400/40" : ""}`}
      {...attributes}
    >
      <div className="flex items-start gap-0.5">
        {selectable && onToggleSelect ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(lead.id);
            }}
            aria-pressed={selected}
            aria-label={selected ? "Deselect for approve" : "Select for approve"}
            className="px-1.5 py-3 text-mist-500 hover:text-aurora-300"
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                selected
                  ? "border-aurora-400 bg-aurora-400 text-ink-950"
                  : "border-white/25 bg-transparent"
              }`}
            >
              {selected && <CheckIcon className="h-2.5 w-2.5" />}
            </span>
          </button>
        ) : (
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
        )}

        {selectable && (
          <button
            {...listeners}
            className="cursor-grab touch-none px-0.5 py-3 text-mist-600 hover:text-mist-300 active:cursor-grabbing"
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
        )}

        <button
          type="button"
          onClick={() => onOpen(lead.id)}
          className="min-w-0 flex-1 rounded-r-xl py-3 text-left transition-colors hover:bg-white/5"
        >
          <p className="truncate text-sm font-medium text-mist-100">{lead.company}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-mist-500">{subtitle}</p>
          )}
          {showMeta && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
          )}
        </button>

        {nextStage && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveStage(lead.id, nextStage); }}
            title={`Move to ${ALL_COLUMNS.find((c) => c.stage === nextStage)?.title ?? nextStage}`}
            className="mr-2 self-center rounded-md p-1 text-mist-600 opacity-0 transition-all hover:bg-white/10 hover:text-aurora-300 group-hover:opacity-100"
          >
            <ArrowIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

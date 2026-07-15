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
import { SparkIcon, MailIcon, PhoneIcon, FormIcon, InfoIcon } from "@/components/icons";

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
  {
    stage: "discarded",
    title: "Discarded",
    empty: "Move bad-fit or incorrect leads here.",
    color: "bg-mist-600",
  },
];

/** Card subtitle: contact/location — not the niche tag (that looked like a wrong "category"). */
function cardSubtitle(lead: LeadWithOutreach): string | null {
  return (
    lead.emails[0] ??
    lead.location ??
    lead.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ??
    null
  );
}

// ─── Pipeline (CRM kanban with drag-and-drop) ─────────────────────────────────

export function PipelineView({
  leads,
  onOpen,
  onMoveStage,
  onDraft,
}: {
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  onDraft: (leadId: string) => Promise<void>;
}) {
  const [draftingAll, setDraftingAll] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [parkedOpen, setParkedOpen] = useState<Record<string, boolean>>({
    not_interested: false,
    discarded: false,
  });

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

  const draftAll = async () => {
    setDraftingAll(true);
    for (const l of undraftedLeads) await onDraft(l.id);
    setDraftingAll(false);
  };

  const newHeaderActions = undraftedLeads.length > 0 ? (
    <button
      type="button"
      onClick={() => void draftAll()}
      disabled={draftingAll}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100 disabled:opacity-50"
    >
      {draftingAll ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3 w-3 text-aurora-300" />}
      Draft all ({undraftedLeads.length})
    </button>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="shrink-0 text-xs uppercase tracking-widest text-mist-500">
        <span className="font-semibold text-mist-200">{leads.length}</span> lead
        {leads.length === 1 ? "" : "s"} · drag to move between stages
        <span className="normal-case tracking-normal text-mist-600">
          {" "}
          · ⓘ for details
        </span>
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div
            className="grid min-h-0 flex-1 gap-3"
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
                  activeId={activeId}
                  headerActions={col.stage === "new" ? newHeaderActions : null}
                />
              );
            })}
          </div>

          <div className="grid shrink-0 gap-2 sm:grid-cols-2">
            {PARKED_COLUMNS.map((col) => {
              const colLeads = leads.filter((l) => l.crmStage === col.stage);
              const open = parkedOpen[col.stage] ?? false;
              return (
                <div key={col.stage} className="min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setParkedOpen((prev) => ({ ...prev, [col.stage]: !prev[col.stage] }))
                    }
                    className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-ink-950/40 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${col.color}`} />
                    <span className="truncate text-sm font-semibold text-mist-100">{col.title}</span>
                    <span className="ml-auto font-display text-base tabular-nums text-mist-400">
                      {colLeads.length}
                    </span>
                    <span className="text-xs text-mist-600">{open ? "▾" : "▸"}</span>
                  </button>
                  {open ? (
                    <div className="mt-2 max-h-[28vh]">
                      <PipelineColumn
                        col={col}
                        leads={colLeads}
                        onOpen={onOpen}
                        activeId={activeId}
                        compact
                      />
                    </div>
                  ) : (
                    <CollapsedDropZone stage={col.stage} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {activeLead ? (
            <div className="w-60 rotate-2 cursor-grabbing rounded-xl border border-aurora-400/40 bg-ink-800 px-3 py-3 shadow-2xl">
              <p className="truncate text-sm font-medium text-mist-100">{activeLead.company}</p>
              <p className="mt-1 truncate text-xs text-mist-500">
                {cardSubtitle(activeLead) ?? "No contact yet"}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function CollapsedDropZone({ stage }: { stage: CrmStage }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`mt-1 h-2 rounded-full transition-colors ${
        isOver ? "bg-aurora-400/40" : "bg-transparent"
      }`}
      aria-hidden
    />
  );
}

function PipelineColumn({
  col,
  leads,
  onOpen,
  activeId,
  headerActions,
  compact,
}: {
  col: (typeof MAIN_COLUMNS)[number] | (typeof PARKED_COLUMNS)[number];
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  activeId: string | null;
  headerActions?: React.ReactNode;
  compact?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-0 min-w-0 flex-col rounded-xl2 border transition-colors ${
        compact ? "max-h-[28vh]" : ""
      } ${
        isOver ? "border-aurora-400/40 bg-aurora-400/5" : "border-white/10 bg-ink-950/40"
      }`}
    >
      <div className="flex min-h-[2.75rem] shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2.5 sm:px-4">
        <span className={`h-2 w-2 shrink-0 rounded-full ${col.color}`} />
        <h3 className="truncate text-sm font-semibold leading-none text-mist-100">{col.title}</h3>
        {headerActions && (
          <div className="flex shrink-0 items-center gap-1">{headerActions}</div>
        )}
        <span className="ml-auto font-display text-lg leading-none tabular-nums text-aurora-300">
          {leads.length}
        </span>
      </div>
      {/* min-h-0 is required so flex children can scroll instead of clipping */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
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
  isDragging,
}: {
  lead: LeadWithOutreach;
  onOpen: (id: string) => void;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });
  const pendingFollowUps = lead.followUps?.filter((f) => !f.done).length ?? 0;
  const subtitle = cardSubtitle(lead);
  const showMeta = pendingFollowUps > 0 || !!lead.contactMethod;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group flex min-h-[3.25rem] cursor-grab touch-none items-center gap-1 overflow-hidden rounded-xl border border-white/5 bg-ink-900/60 px-3 py-2.5 transition-all hover:bg-white/[0.03] active:cursor-grabbing ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-snug text-mist-100">{lead.company}</p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs leading-snug text-mist-500">{subtitle}</p>
        )}
        {showMeta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
      </div>

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(lead.id);
        }}
        aria-label={`Lead info for ${lead.company}`}
        title="Lead info"
        className="shrink-0 rounded-md p-1 text-mist-600 transition-colors hover:bg-white/10 hover:text-mist-200"
      >
        <InfoIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

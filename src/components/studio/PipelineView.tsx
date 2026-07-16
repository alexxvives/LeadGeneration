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
import type { ContactMethod, CrmStage, LeadWithOutreach } from "@/lib/types";
import { MailIcon, PhoneIcon, FormIcon, InfoIcon } from "@/components/icons";
import { displayWebsite } from "@/lib/website";

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
];

/** Card subtitle: website host — not email or street address. */
function cardSubtitle(lead: LeadWithOutreach): string | null {
  return displayWebsite(lead.website) ?? null;
}

// ─── Pipeline (CRM kanban with drag-and-drop) ─────────────────────────────────

export function PipelineView({
  leads,
  onOpen,
  onMoveStage,
}: {
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (
    leadId: string,
    stage: CrmStage,
    contactMethod?: ContactMethod | null,
  ) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingRevert, setPendingRevert] = useState<{
    leadId: string;
    company: string;
  } | null>(null);
  const [parkedOpen, setParkedOpen] = useState<Record<string, boolean>>({
    not_interested: false,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function wasEmailed(lead: LeadWithOutreach): boolean {
    return (
      lead.crmStage === "contacted" ||
      lead.status === "sent" ||
      lead.outreach?.status === "sent" ||
      lead.contactMethod === "email"
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const lead = leads.find((l) => l.id === active.id);
    const newStage = over.id as CrmStage;
    if (!lead || lead.crmStage === newStage) return;

    // Moving a previously emailed lead back to New — confirm first.
    if (newStage === "new" && wasEmailed(lead)) {
      setPendingRevert({ leadId: lead.id, company: lead.company });
      return;
    }

    onMoveStage(String(active.id), newStage);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="shrink-0 text-xs uppercase tracking-widest text-mist-500">
        <span className="font-semibold text-mist-200">{leads.length}</span> lead
        {leads.length === 1 ? "" : "s"} · drag to move between stages
      </p>

      {pendingRevert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={() => setPendingRevert(null)}
          />
          <div className="animate-float-up relative w-full max-w-md rounded-xl2 border border-amber-400/20 bg-ink-900 p-6 shadow-2xl">
            <p className="font-display text-lg font-semibold text-mist-100">Move back to New?</p>
            <p className="mt-2 text-sm text-mist-300">
              <span className="text-mist-100">{pendingRevert.company}</span> already has outreach
              history. Moving to New clears the stage only — it doesn&apos;t unsend the email.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRevert(null)}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-mist-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onMoveStage(pendingRevert.leadId, "new");
                  setPendingRevert(null);
                }}
                className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-ink-950"
              >
                Move to New
              </button>
            </div>
          </div>
        </div>
      )}

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
                />
              );
            })}
          </div>

          <div className="grid shrink-0 gap-2 sm:grid-cols-1">
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
  compact,
}: {
  col: (typeof MAIN_COLUMNS)[number] | (typeof PARKED_COLUMNS)[number];
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  activeId: string | null;
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
        <span className="ml-auto font-display text-lg leading-none tabular-nums text-aurora-300">
          {leads.length}
        </span>
      </div>
      {/* min-h-0 is required so flex children can scroll instead of clipping */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3">
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
  const needsMethod =
    lead.crmStage === "contacted" && !lead.contactMethod;
  // Meta only on Contacted+ — keeps New cards compact after a round-trip.
  const showMeta =
    lead.crmStage !== "new" &&
    (pendingFollowUps > 0 || !!lead.contactMethod);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group flex h-auto cursor-grab touch-none items-start gap-1 rounded-xl border border-white/5 bg-ink-900/60 px-3 py-2.5 transition-all hover:bg-white/[0.03] active:cursor-grabbing ${
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
        aria-label={
          needsMethod
            ? `Set how you contacted ${lead.company}`
            : `Lead info for ${lead.company}`
        }
        title={needsMethod ? "How contacted? Open to set method" : "Lead info"}
        className={`shrink-0 rounded-md p-1 transition-colors ${
          needsMethod
            ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-400/30"
            : "text-mist-600 hover:bg-white/10 hover:text-mist-200"
        }`}
      >
        <InfoIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

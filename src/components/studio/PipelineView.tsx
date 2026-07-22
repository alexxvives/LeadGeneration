"use client";

import { useRef, useState } from "react";
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
import { FitMeter } from "@/components/ui";
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
    contactMethods?: ContactMethod[] | null,
  ) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragStartedRef = useRef(false);
  const [parkedOpen, setParkedOpen] = useState<Record<string, boolean>>({
    not_interested: false,
  });

  // 8px before drag activates — plain click still fires and opens the lead.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    dragStartedRef.current = true;
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    // Suppress the trailing click that browsers fire after a drag.
    window.setTimeout(() => {
      dragStartedRef.current = false;
    }, 0);
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="shrink-0 text-xs uppercase tracking-widest text-mist-500">
        <span className="font-semibold text-mist-200">{leads.length}</span> lead
        {leads.length === 1 ? "" : "s"} · click for info · drag to move
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div
            className="grid min-h-0 flex-1 gap-3 overflow-x-auto pb-1"
            style={{
              gridTemplateColumns: `repeat(${MAIN_COLUMNS.length}, minmax(11rem, 1fr))`,
            }}
          >
            {MAIN_COLUMNS.map((col) => {
              const colLeads = leads.filter((l) => l.crmStage === col.stage);
              return (
                <PipelineColumn
                  key={col.stage}
                  col={col}
                  leads={colLeads}
                  onOpen={openIfClick}
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
                <ParkedStage
                  key={col.stage}
                  col={col}
                  leads={colLeads}
                  open={open}
                  onToggle={() =>
                    setParkedOpen((prev) => ({
                      ...prev,
                      [col.stage]: !prev[col.stage],
                    }))
                  }
                  onOpen={openIfClick}
                  activeId={activeId}
                />
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

/** Same chrome as main columns: header + body, one border, divider line only. */
function ParkedStage({
  col,
  leads,
  open,
  onToggle,
  onOpen,
  activeId,
}: {
  col: (typeof PARKED_COLUMNS)[number];
  leads: LeadWithOutreach[];
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
          {leads.length}
        </span>
        <span className="text-xs text-mist-600">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="max-h-[28vh] overflow-y-auto overscroll-contain p-3">
          {leads.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-mist-500">
              {col.empty}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {[...leads]
                .sort((a, b) => {
                  const ar = a.outreach?.deliveryStatus === "replied" ? 1 : 0;
                  const br = b.outreach?.deliveryStatus === "replied" ? 1 : 0;
                  return br - ar;
                })
                .map((l) => (
                  <DraggablePipelineCard
                    key={l.id}
                    lead={l}
                    onOpen={onOpen}
                    isDragging={l.id === activeId}
                  />
                ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PipelineColumn({
  col,
  leads,
  onOpen,
  activeId,
}: {
  col: (typeof MAIN_COLUMNS)[number] | (typeof PARKED_COLUMNS)[number];
  leads: LeadWithOutreach[];
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
          {leads.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3">
        {leads.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-mist-500">
            {col.empty}
          </p>
        ) : (
          [...leads]
            .sort((a, b) => {
              const ar = a.outreach?.deliveryStatus === "replied" ? 1 : 0;
              const br = b.outreach?.deliveryStatus === "replied" ? 1 : 0;
              if (br !== ar) return br - ar;
              const an =
                a.crmStage === "contacted" && !(a.contactMethods?.length)
                  ? 1
                  : 0;
              const bn =
                b.crmStage === "contacted" && !(b.contactMethods?.length)
                  ? 1
                  : 0;
              return bn - an;
            })
            .map((l) => (
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

function MethodIcons({ methods }: { methods: ContactMethod[] }) {
  return (
    <>
      {methods.includes("email") && <MailIcon className="h-2.5 w-2.5" />}
      {methods.includes("phone") && <PhoneIcon className="h-2.5 w-2.5" />}
      {methods.includes("contact_form") && <FormIcon className="h-2.5 w-2.5" />}
    </>
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
  const replied = lead.outreach?.deliveryStatus === "replied";
  const methods = lead.contactMethods ?? [];
  const needsMethod = lead.crmStage === "contacted" && methods.length === 0;
  const showMeta =
    lead.crmStage !== "new" &&
    (pendingFollowUps > 0 || methods.length > 0 || replied || needsMethod);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(lead.id)}
      className={`group flex h-auto cursor-grab touch-none items-start gap-1 rounded-xl px-3 py-2.5 transition-all active:cursor-grabbing ${
        replied
          ? "border border-sky-400/50 bg-sky-400/10 shadow-[0_0_0_1px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/30 hover:bg-sky-400/15"
          : needsMethod
            ? "border border-amber-400/50 bg-amber-400/10 ring-1 ring-amber-400/30 hover:bg-amber-400/15"
            : "border border-white/5 bg-ink-900/60 hover:bg-white/[0.03]"
      } ${isDragging ? "opacity-30" : ""}`}
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
        </div>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs leading-snug text-mist-500">{subtitle}</p>
        )}
        <div className="mt-1.5">
          <FitMeter score={lead.fitScore} compact />
        </div>
        {showMeta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {replied && (
              <span className="rounded-full bg-sky-400/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
                Replied
              </span>
            )}
            {needsMethod && (
              <span className="rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                How contacted?
              </span>
            )}
            {pendingFollowUps > 0 && (
              <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                {pendingFollowUps} follow-up{pendingFollowUps > 1 ? "s" : ""}
              </span>
            )}
            {methods.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-ink-800/80 px-1.5 py-0.5 text-[10px] font-medium text-mist-300 ring-1 ring-ink-600/40"
                title={methods.join(", ")}
              >
                <MethodIcons methods={methods} />
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
            ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-400/30"
            : "text-mist-500 hover:bg-white/10 hover:text-mist-100"
        }`}
      >
        <InfoIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

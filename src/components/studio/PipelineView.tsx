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

const CRM_COLUMNS: {
  stage: CrmStage;
  title: string;
  hint: string;
  empty: string;
  color: string; // dot colour class
}[] = [
  {
    stage: "new",
    title: "New",
    hint: "Just found",
    empty: "No untouched leads — run a search to add more.",
    color: "bg-mist-500",
  },
  {
    stage: "contacted",
    title: "Contacted",
    hint: "First outreach sent",
    empty: "Send an approved email or drag a card here.",
    color: "bg-amber-400",
  },
  {
    stage: "in_conversation",
    title: "In Conversation",
    hint: "Active dialogue",
    empty: "Move here when they reply.",
    color: "bg-aurora-400",
  },
  {
    stage: "closed",
    title: "Closed",
    hint: "Won — became a client",
    empty: "Move here when you close the deal.",
    color: "bg-aurora-300",
  },
  {
    stage: "not_interested",
    title: "Not Interested",
    hint: "Lost",
    empty: "Move here when they decline.",
    color: "bg-rose-400",
  },
];

// Email-workflow status badge inside a pipeline card.
const EMAIL_STATUS_BADGE: Record<string, { label: string; cls: string } | undefined> = {
  queued:   { label: "Draft ready", cls: "bg-amber-400/15 text-amber-300" },
  approved: { label: "Approved",    cls: "bg-aurora-400/15 text-aurora-300" },
  sent:     { label: "Sent",        cls: "bg-aurora-500/20 text-aurora-300" },
  failed:   { label: "Failed",      cls: "bg-rose-500/15 text-rose-300" },
};

// Next CRM stage for the quick-advance button on each card.
const NEXT_CRM_STAGE: Partial<Record<CrmStage, CrmStage>> = {
  new: "contacted",
  contacted: "in_conversation",
  in_conversation: "closed",
};

// ─── Pipeline (CRM kanban with drag-and-drop) ─────────────────────────────────

export function PipelineView({
  leads,
  approvedLeads,
  onOpen,
  onMoveStage,
  onDraft,
  onDecide,
  onSend,
  canSend,
}: {
  leads: LeadWithOutreach[];
  approvedLeads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  onDraft: (leadId: string) => Promise<void>;
  onDecide: (outreachId: string, decision: "approved" | "rejected") => Promise<void>;
  onSend: (outreachId: string) => Promise<void>;
  canSend: boolean;
}) {
  const [sendingAll, setSendingAll] = useState(false);
  const [draftingAll, setDraftingAll] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Leads with a draft ready for review (lead status "queued" = draft written, awaiting approval).
  const queuedLeads = leads.filter((l) => l.status === "queued" && l.outreach);
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

  const sendAllApproved = async () => {
    setSendingAll(true);
    for (const l of approvedLeads) {
      if (l.outreach) await onSend(l.outreach.id);
    }
    setSendingAll(false);
  };

  const draftAll = async () => {
    setDraftingAll(true);
    for (const l of undraftedLeads) await onDraft(l.id);
    setDraftingAll(false);
  };

  const approveAll = async () => {
    setApprovingAll(true);
    for (const l of queuedLeads) {
      if (l.outreach) await onDecide(l.outreach.id, "approved");
    }
    setApprovingAll(false);
  };

  // Collect all active bulk actions to show in one bar.
  const bulkActions: React.ReactNode[] = [];
  if (undraftedLeads.length > 0) {
    bulkActions.push(
      <button
        key="draft-all"
        onClick={draftAll}
        disabled={draftingAll}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        {draftingAll ? <Spinner className="h-3.5 w-3.5" /> : <SparkIcon className="h-3.5 w-3.5 text-aurora-300" />}
        Draft all ({undraftedLeads.length})
      </button>,
    );
  }
  if (queuedLeads.length > 0) {
    bulkActions.push(
      <button
        key="approve-all"
        onClick={approveAll}
        disabled={approvingAll}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        {approvingAll ? <Spinner className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5 text-aurora-300" />}
        Approve all drafts ({queuedLeads.length})
      </button>,
    );
  }
  if (approvedLeads.length > 0) {
    bulkActions.push(
      <button
        key="send-all"
        onClick={sendAllApproved}
        disabled={sendingAll}
        className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-4 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
      >
        {sendingAll ? <Spinner className="h-3.5 w-3.5" /> : <ArrowIcon className="h-3.5 w-3.5" />}
        {canSend ? `Send all (${approvedLeads.length})` : `Send demo (${approvedLeads.length})`}
      </button>,
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk-action bar — only shown when there's something to do */}
      {bulkActions.length > 0 && (
        <div className="glass flex flex-wrap items-center justify-end gap-2 rounded-xl2 p-3">
          <p className="mr-auto text-xs text-mist-500">Bulk actions</p>
          {bulkActions}
        </div>
      )}

      <p className="text-xs uppercase tracking-widest text-mist-500">
        <span className="font-semibold text-mist-200">{leads.length}</span> lead
        {leads.length === 1 ? "" : "s"} · drag to move between stages
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${CRM_COLUMNS.length}, minmax(0, 1fr))` }}>
          {CRM_COLUMNS.map((col) => {
            const colLeads = leads.filter((l) => l.crmStage === col.stage);
            return (
              <PipelineColumn
                key={col.stage}
                col={col}
                leads={colLeads}
                onOpen={onOpen}
                onMoveStage={onMoveStage}
                activeId={activeId}
              />
            );
          })}
        </div>

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
}: {
  col: (typeof CRM_COLUMNS)[number];
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl2 border transition-colors ${
        isOver ? "border-aurora-400/40 bg-aurora-400/5" : "border-white/10 bg-ink-950/40"
      }`}
    >
      <div className="border-b border-white/5 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${col.color}`} />
            <h3 className="text-sm font-semibold text-mist-100">{col.title}</h3>
          </div>
          <span className="font-display text-lg tabular-nums text-aurora-300">{leads.length}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-mist-500">{col.hint}</p>
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
  onMoveStage,
  isDragging,
}: {
  lead: LeadWithOutreach;
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: CrmStage) => void;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });
  const emailBadge = lead.outreach ? EMAIL_STATUS_BADGE[lead.outreach.status] : undefined;
  const pendingFollowUps = lead.followUps?.filter((f) => !f.done).length ?? 0;
  const nextStage = lead.crmStage ? NEXT_CRM_STAGE[lead.crmStage] : undefined;

  // Subtitle: category tag only (no location — keeps cards readable).
  const subtitle = lead.tags[0] ?? lead.emails[0] ?? lead.website ?? null;

  return (
    <div
      ref={setNodeRef}
      className={`group rounded-xl border border-white/5 bg-ink-900/60 transition-opacity ${
        isDragging ? "opacity-30" : ""
      }`}
      {...attributes}
    >
      <div className="flex items-start gap-0.5">
        {/* Drag grip */}
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

        {/* Card body — click to open drawer */}
        <button
          type="button"
          onClick={() => onOpen(lead.id)}
          className="min-w-0 flex-1 py-3 text-left transition-colors hover:bg-white/5 rounded-r-xl"
        >
          <p className="truncate text-sm font-medium text-mist-100">{lead.company}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-mist-500">{subtitle}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {emailBadge && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${emailBadge.cls}`}>
                {emailBadge.label}
              </span>
            )}
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
        </button>

        {/* Quick-advance button — appears on hover, moves to next stage */}
        {nextStage && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveStage(lead.id, nextStage); }}
            title={`Move to ${CRM_COLUMNS.find((c) => c.stage === nextStage)?.title ?? nextStage}`}
            className="self-center mr-2 rounded-md p-1 text-mist-600 opacity-0 transition-all hover:bg-white/10 hover:text-aurora-300 group-hover:opacity-100"
          >
            <ArrowIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

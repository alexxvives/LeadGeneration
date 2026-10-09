"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContactMethod, LeadWithOutreach } from "@/lib/types";
import { loadWarmupProfile, warmupStatus } from "@/lib/email/warmup";
import { parseRecipientEmail } from "@/lib/email/address";
import { Spinner } from "@/components/ui";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  SendIcon,
  TrashIcon,
} from "@/components/icons";
import { Bone, useStableDuringLoad } from "./skeletons";
import { isOutreachReadyStatus } from "@/lib/lead-lanes";
import { PitchEditor } from "./PitchEditor";
import { Lockable, useBoardLockUi } from "./board-lock";
import { displayWebsite, isUsableWebsite } from "@/lib/website";
import { VirtualColumnList } from "./virtual-list";

type OutreachBucket = "review" | "ready" | "contacted";
/** Send-list contact-channel filter. */
type ReadyChannelFilter = "all" | "email" | "phone";

function leadEmail(lead: LeadWithOutreach): string | null {
  const fromLead = lead.emails.find((e) => e.trim())?.trim() ?? null;
  // Bounced recipient is dead — don't treat leftover outreach.toEmail as live.
  if (lead.outreach?.deliveryStatus === "bounced") return fromLead;
  const raw = lead.outreach?.toEmail ?? fromLead;
  const t = raw?.trim();
  return t || null;
}

function leadPhone(lead: LeadWithOutreach): string | null {
  const t = lead.phones[0]?.trim();
  return t || null;
}

/**
 * Outreach "Contacted" = email already sent / email channel logged, or a
 * terminal CRM stage. Phone / form / Instagram alone must NOT pull an email
 * lead out of Contact Draft / Ready — they can still draft & send.
 */
function isContacted(lead: LeadWithOutreach): boolean {
  const methods = lead.contactMethods ?? [];
  const stage = lead.crmStage;
  const email = leadEmail(lead);
  const nonEmailReach =
    methods.includes("phone") ||
    methods.includes("contact_form") ||
    methods.includes("instagram") ||
    methods.includes("whatsapp") ||
    methods.includes("organic");
  const emailed =
    lead.outreach?.status === "sent" || methods.includes("email");

  // A bounce is not email contact — allow re-draft when a new address exists
  // unless the pipeline is already past outreach (conversation / closed).
  if (lead.outreach?.deliveryStatus === "bounced" && !emailed) {
    if (email) {
      return (
        stage === "in_conversation" ||
        stage === "closed" ||
        stage === "not_interested"
      );
    }
    // No usable email left: non-email reach (or nothing) → Contacted / hide.
    return (
      nonEmailReach ||
      stage === "in_conversation" ||
      stage === "closed" ||
      stage === "not_interested" ||
      stage === "contacted"
    );
  }

  if (emailed) return true;

  // Non-email contact with an email on file → stay in draft/send queue.
  if (nonEmailReach && email) {
    return (
      stage === "in_conversation" ||
      stage === "closed" ||
      stage === "not_interested"
    );
  }

  // Phone-only logged contact (no email) → Contacted column.
  if (nonEmailReach) return true;

  return (
    stage === "contacted" ||
    stage === "in_conversation" ||
    stage === "closed" ||
    stage === "not_interested"
  );
}

function bucketOf(lead: LeadWithOutreach): OutreachBucket | null {
  if (isContacted(lead)) return "contacted";
  const email = leadEmail(lead);
  const phone = leadPhone(lead);

  // Phone-only → Ready (call path; no email draft).
  if (!email && phone) return "ready";
  // No email and no phone → hide from Outreach queue.
  if (!email) return null;

  // Email leads: no draft → Contact Draft; saved draft → Ready (ADR 0029).
  // Use draft status directly — CRM "contacted" via phone/form/IG can still
  // sit in Ready when a draft exists.
  if (isOutreachReadyStatus(lead.outreach?.status)) return "ready";
  return "review";
}

/** Email lead in Contact Draft that still needs a first write (or after reject). */
export function needsOutreachDraft(lead: LeadWithOutreach): boolean {
  if (!leadEmail(lead)) return false;
  if (isContacted(lead)) return false;
  const s = lead.outreach?.status;
  return !s || s === "rejected";
}

/** Email lead with a draft that Re-draft all rewrites (Ready column). */
export function canRedraftOutreach(lead: LeadWithOutreach): boolean {
  if (!leadEmail(lead)) return false;
  if (isContacted(lead)) return false;
  const s = lead.outreach?.status;
  return s === "draft" || s === "approved" || s === "failed";
}

/** Company A–Z (stable). */
function byCompany(a: LeadWithOutreach, b: LeadWithOutreach): number {
  return a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
}

function emptyCopy(
  leads: LeadWithOutreach[],
  channel: ReadyChannelFilter,
  draftRemaining: number,
): string {
  if (channel === "phone") {
    return "No phone-only leads to call. Switch to All or Email.";
  }
  if (channel === "email") {
    if (draftRemaining > 0) {
      return "No drafted emails yet. Draft remaining adds them to this list.";
    }
    return "No drafted emails to send.";
  }
  if (draftRemaining > 0) {
    return "Nothing to send yet. Draft remaining writes the emails that are still waiting.";
  }
  if (leads.length === 0) {
    return "Nothing to send for this search or type.";
  }
  return "Nothing to send.";
}

function contactedDayHint(sentToday: number, softCap: number): string {
  if (sentToday >= softCap) {
    return `${sentToday} sent today · over ~${softCap}/day suggest`;
  }
  return `${sentToday} sent today · ~${softCap}/day suggest`;
}

/**
 * Uncontacted ready leads in a list on the left. The open lead’s facts and
 * draft (or call) sit on the right. Previous / next are centered on the top
 * bar. Undrafted emails stay out until Draft remaining.
 * Send is the per-lead human gate (ADR 0029). A successful send leaves this view.
 */
export function OutreachView({
  leads,
  sendsToday = 0,
  warmupScopeId = null,
  canSendEmail,
  busyIds = [],
  backfilling = false,
  loadedCount,
  totalCount,
  onOpenInfo,
  onEnsureDetail,
  onSaveDraft,
  onSend,
  onDraftAll,
  onMarkContacted,
  onLogCall,
  onDeleteLead,
}: {
  leads: LeadWithOutreach[];
  /** Workspace DB count of emails sent from this board’s mailbox today. */
  sendsToday?: number;
  /** Board outreach profile (or board id) — mailbox age / ~N/day suggest. */
  warmupScopeId?: string | null;
  canSendEmail: boolean;
  /** Lead / outreach ids currently drafting or sending (concurrent OK). */
  busyIds?: readonly string[];
  /** Large boards page in — the queue may gain rows until this finishes. */
  backfilling?: boolean;
  loadedCount?: number;
  totalCount?: number;
  onOpenInfo: (id: string) => void;
  /** Board list omits the email body — fetch it when this lead is on screen. */
  onEnsureDetail: (id: string) => void;
  onSaveDraft: (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
    opts?: { silent?: boolean },
  ) => Promise<void>;
  onSend: (outreachId: string) => Promise<boolean>;
  onDraftAll: (opts?: { redraft?: boolean }) => Promise<void>;
  onMarkContacted: (
    leadId: string,
    method: ContactMethod,
    opts?: { promptNote?: boolean; missed?: boolean },
  ) => Promise<void>;
  /** Phone-only: open the call log without leaving the queue yet. */
  onLogCall?: (leadId: string) => void;
  onDeleteLead: (leadId: string) => Promise<void> | void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const busySet = useMemo(() => new Set(busyIds), [busyIds]);
  const [readyChannel, setReadyChannel] = useState<ReadyChannelFilter>("all");
  const [drafting, setDrafting] = useState<null | "remaining" | "redraft">(null);
  const skipReadyChannelPersist = useRef(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);

  // Keep channel filter across tab switches / Settings (session only).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("hermes_outreach_ready_channel");
      if (raw === "email" || raw === "phone" || raw === "all") {
        setReadyChannel(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (skipReadyChannelPersist.current) {
      skipReadyChannelPersist.current = false;
      return;
    }
    try {
      sessionStorage.setItem("hermes_outreach_ready_channel", readyChannel);
    } catch {
      /* ignore */
    }
  }, [readyChannel]);

  const draftRemainingCount = useMemo(
    () => leads.filter(needsOutreachDraft).length,
    [leads],
  );
  const redraftAllAvailable = useMemo(
    () => leads.some(canRedraftOutreach),
    [leads],
  );

  const groupedReady = useMemo(() => {
    const ready: LeadWithOutreach[] = [];
    for (const lead of leads) {
      if (bucketOf(lead) === "ready") ready.push(lead);
    }
    if (readyChannel === "email") {
      return ready.filter((l) => Boolean(leadEmail(l)));
    }
    if (readyChannel === "phone") {
      return ready.filter((l) => !leadEmail(l) && Boolean(leadPhone(l)));
    }
    return ready;
  }, [leads, readyChannel]);

  const rows = useStableDuringLoad(groupedReady, byCompany, backfilling);

  useEffect(() => {
    if (rows.length === 0) return;
    if (focusId && rows.some((row) => row.id === focusId)) {
      pendingFocus.current = null;
      return;
    }
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    if (pending && rows.some((lead) => lead.id === pending)) {
      setFocusId(pending);
      return;
    }
    setFocusId(rows[0]!.id);
  }, [rows, focusId]);

  const index = Math.max(
    0,
    rows.findIndex((lead) => lead.id === focusId),
  );
  const lead = rows[index] ?? null;
  const leadId = lead?.id ?? null;

  useEffect(() => {
    if (leadId) onEnsureDetail(leadId);
  }, [leadId, onEnsureDetail]);

  const softCap = warmupStatus(loadWarmupProfile(warmupScopeId)).softCap;
  const overSoftCap = sendsToday >= softCap;
  const draftBusy = drafting !== null || busySet.has("draft-all");

  const runDraft = async (mode: "remaining" | "redraft") => {
    if (editLocked || draftBusy) return;
    setDrafting(mode);
    try {
      await onDraftAll(mode === "redraft" ? { redraft: true } : undefined);
    } finally {
      setDrafting(null);
    }
  };

  const go = (delta: number) => {
    const next = rows[index + delta];
    if (next) setFocusId(next.id);
  };

  const advanceAfterSend = (ok: boolean) => {
    if (!ok) return;
    const nextId = rows[index + 1]?.id ?? rows[index - 1]?.id ?? null;
    pendingFocus.current = nextId;
    setFocusId(nextId);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="min-w-0 justify-self-start">
        <div
          className="inline-flex rounded-full border border-white/10 bg-ink-900/60 p-1"
          role="group"
          aria-label="Filter by contact channel"
        >
          {(
            [
              ["all", "All"],
              ["email", "Email"],
              ["phone", "Phone"],
            ] as const
          ).map(([id, label]) => {
            const active = readyChannel === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setReadyChannel(id)}
                aria-pressed={active}
                className={`min-h-8 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  active
                    ? "bg-aurora-400 text-on-accent"
                    : "text-mist-300 hover:text-mist-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        </div>
        <div className="flex justify-center">
          {lead ? (
            <LeadPager
              index={index}
              total={rows.length}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 lg:justify-self-end">
          {redraftAllAvailable ? (
            <Lockable>
              <button
                type="button"
                onClick={() => void runDraft("redraft")}
                disabled={editLocked || draftBusy}
                title={
                  editLocked
                    ? lockHint
                    : "Rewrite queued drafts and draft anything still remaining"
                }
                className="glass inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-mist-100 disabled:opacity-50"
              >
                {drafting === "redraft" ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <PencilIcon className="h-3.5 w-3.5" />
                )}
                Re-draft all
              </button>
            </Lockable>
          ) : null}
          {draftRemainingCount > 0 ? (
            <Lockable>
              <button
                type="button"
                onClick={() => void runDraft("remaining")}
                disabled={editLocked || draftBusy}
                title={
                  editLocked
                    ? lockHint
                    : "Write the emails that still need a first draft. They join this list when it finishes."
                }
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-amber-400 px-3.5 text-sm font-medium text-on-accent disabled:opacity-50"
              >
                {drafting === "remaining" ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : null}
                Draft remaining ({draftRemainingCount})
              </button>
            </Lockable>
          ) : null}
        </div>
      </div>

      <p
        className={`shrink-0 text-xs ${
          overSoftCap ? "text-amber-300/90" : "text-mist-500"
        }`}
        title="Soft recommend for this board’s inbox (Settings → mailbox age). Warning only — not a hard block."
      >
        {contactedDayHint(sendsToday, softCap)}
      </p>

      {backfilling ? (
        <p
          className="shrink-0 text-[11px] text-mist-500"
          role="status"
          aria-live="polite"
        >
          Loading more
          {loadedCount != null ? (
            <>
              {" "}
              <span className="tabular-nums text-mist-300">
                {loadedCount}
                {totalCount != null ? `/${totalCount}` : ""}
              </span>
            </>
          ) : null}
          … top of the list first
        </p>
      ) : null}

      <section
        data-tour="outreach-queue"
        aria-label="Outreach review"
        className="flex min-h-0 flex-1 flex-col"
      >
        {rows.length === 0 || !lead ? (
          <div className="m-0 flex flex-1 items-center justify-center rounded-xl2 border border-dashed border-white/10 px-6 py-10 text-center">
            <div>
              <p className="text-sm text-mist-300">
                {backfilling
                  ? "Loading the queue…"
                  : emptyCopy(leads, readyChannel, draftRemainingCount)}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
            <LeadQueue
              rows={rows}
              focusId={lead.id}
              activeIndex={index}
              onSelect={setFocusId}
              onDelete={(id) => {
                if (id === focusId) {
                  const nextId =
                    rows[index + 1]?.id ?? rows[index - 1]?.id ?? null;
                  setFocusId(nextId);
                }
                void onDeleteLead(id);
              }}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden lg:grid lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
            <LeadFacts
              lead={lead}
              onOpenInfo={() => onOpenInfo(lead.id)}
            />
            <ReviewAction
              lead={lead}
              busy={
                busySet.has(lead.id) ||
                (!!lead.outreach?.id && busySet.has(lead.outreach.id))
              }
              canSendEmail={canSendEmail}
              hasNext={index < rows.length - 1}
              onSaveDraft={onSaveDraft}
              onSend={onSend}
              onAdvance={advanceAfterSend}
              onMarkContacted={onMarkContacted}
              onLogCall={onLogCall ? () => onLogCall(lead.id) : undefined}
              onSkip={() => go(1)}
            />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function LeadPager({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-ink-900/60 px-1 py-0.5">
      <button
        type="button"
        onClick={onPrev}
        disabled={index <= 0}
        aria-label="Previous lead"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-mist-300 hover:bg-white/5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400/70"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      <p className="min-w-[4.5rem] text-center text-xs tabular-nums text-mist-400">
        {index + 1} of {total}
      </p>
      <button
        type="button"
        onClick={onNext}
        disabled={index >= total - 1}
        aria-label="Next lead"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-mist-300 hover:bg-white/5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400/70"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function queueSubtitle(lead: LeadWithOutreach): string {
  return lead.contactName?.trim() || leadEmail(lead) || leadPhone(lead) || "";
}

function LeadQueue({
  rows,
  focusId,
  activeIndex,
  onSelect,
  onDelete,
}: {
  rows: LeadWithOutreach[];
  focusId: string;
  activeIndex: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <aside
      aria-label="Leads to contact"
      className="flex max-h-56 min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl2 border border-white/10 bg-ink-950/40 sm:max-h-none sm:w-60 lg:w-[30rem]"
    >
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-aurora-400" aria-hidden />
        <h2 className="truncate text-sm font-semibold leading-none text-mist-100">
          To contact
        </h2>
        <span className="ml-auto font-display text-lg leading-none tabular-nums text-aurora-300">
          {rows.length}
        </span>
      </div>
      <VirtualColumnList
        items={rows}
        estimateSize={52}
        padding={8}
        gap={4}
        itemClassName="px-2"
        activeIndex={activeIndex}
        renderItem={(row) => {
          const selected = row.id === focusId;
          const email = leadEmail(row);
          const subtitle = queueSubtitle(row);
          const confirming = confirmId === row.id;
          return (
            <div
              className={`flex w-full min-h-11 items-center rounded-lg border-l-2 pr-1 transition-colors ${
                selected
                  ? "border-aurora-400 bg-aurora-400/15 text-mist-100"
                  : "border-transparent text-mist-200 hover:bg-white/5"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (confirmId === row.id) setConfirmId(null);
                  onSelect(row.id);
                }}
                aria-current={selected ? "true" : undefined}
                className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 px-2.5 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400/70"
              >
                <span className="flex w-full min-w-0 items-center gap-1.5">
                  {email ? (
                    <MailIcon className="h-3.5 w-3.5 shrink-0 text-mist-500" />
                  ) : (
                    <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-mist-500" />
                  )}
                  <span className="truncate text-sm font-medium">{row.company}</span>
                </span>
                {subtitle ? (
                  <span className="w-full truncate pl-5 text-xs text-mist-400">
                    {subtitle}
                  </span>
                ) : null}
              </button>
              {confirming ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmId(null);
                      onDelete(row.id);
                    }}
                    className="inline-flex min-h-8 items-center rounded-full bg-rose-400 px-2.5 text-xs font-medium text-on-accent hover:bg-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400/60"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    aria-label={`Cancel delete ${row.company}`}
                    className="inline-flex min-h-8 items-center rounded-full px-2 text-xs text-mist-400 hover:text-mist-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400/70"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => {
                      onSelect(row.id);
                      setConfirmId(row.id);
                    }}
                    aria-label={editLocked ? lockHint : `Delete ${row.company}`}
                    title={editLocked ? lockHint : "Delete lead"}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-mist-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400/60 disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </Lockable>
              )}
            </div>
          );
        }}
      />
    </aside>
  );
}

function LeadFacts({
  lead,
  onOpenInfo,
}: {
  lead: LeadWithOutreach;
  onOpenInfo: () => void;
}) {
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  const about = lead.aboutBlurb?.trim();
  return (
    <aside className="flex max-h-56 min-h-0 shrink-0 flex-col overflow-hidden rounded-xl2 border border-white/10 bg-ink-950/40 lg:h-full lg:max-h-none lg:min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="kicker">Lead</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-mist-100">
          {lead.company}
        </h2>
        {lead.contactName ? (
          <p className="mt-1 text-sm text-mist-300">{lead.contactName}</p>
        ) : null}
        <dl className="mt-4 space-y-2 text-sm">
          {email ? (
            <Fact icon={<MailIcon className="h-3.5 w-3.5" />} value={email} />
          ) : null}
          {phone ? (
            <Fact icon={<PhoneIcon className="h-3.5 w-3.5" />} value={phone} />
          ) : null}
          {lead.location ? <Fact label="Location" value={lead.location} /> : null}
          {lead.companyType ? (
            <Fact label="Type" value={lead.companyType} />
          ) : null}
          {isUsableWebsite(lead.website) ? (
            <div className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-mist-500">
                Website
              </dt>
              <dd className="truncate">
                <a
                  href={
                    /^https?:\/\//i.test(lead.website!)
                      ? lead.website!
                      : `https://${lead.website}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-aurora-300 hover:underline"
                >
                  {displayWebsite(lead.website)}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
        {about ? (
          <p className="mt-4 text-sm leading-relaxed text-mist-300">{about}</p>
        ) : null}
        <button
          type="button"
          onClick={onOpenInfo}
          className="mt-4 text-xs font-medium text-aurora-300 hover:underline"
        >
          Open full lead
        </button>
      </div>
    </aside>
  );
}

function Fact({
  label,
  value,
  icon,
}: {
  label?: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      {label ? (
        <dt className="text-[11px] uppercase tracking-wide text-mist-500">
          {label}
        </dt>
      ) : null}
      <dd className="flex min-w-0 items-center gap-1.5 text-mist-100">
        {icon ? <span className="shrink-0 text-mist-500">{icon}</span> : null}
        <span className="truncate" title={value}>
          {value}
        </span>
      </dd>
    </div>
  );
}

function ReviewAction({
  lead,
  busy,
  canSendEmail,
  hasNext,
  onSaveDraft,
  onSend,
  onAdvance,
  onMarkContacted,
  onLogCall,
  onSkip,
}: {
  lead: LeadWithOutreach;
  busy: boolean;
  canSendEmail: boolean;
  hasNext: boolean;
  onSaveDraft: (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
    opts?: { silent?: boolean },
  ) => Promise<void>;
  onSend: (outreachId: string) => Promise<boolean>;
  onAdvance: (ok: boolean) => void;
  onMarkContacted: (
    leadId: string,
    method: ContactMethod,
    opts?: { promptNote?: boolean; missed?: boolean },
  ) => Promise<void>;
  onLogCall?: () => void;
  onSkip: () => void;
}) {
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  const phoneOnly = !email && Boolean(phone);
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl2 border border-white/10 bg-ink-950/40 lg:h-full">
      {email && lead.outreach ? (
        lead.detailLoaded === true ? (
          <EmailComposer
            key={`${lead.id}:${lead.outreach.id}`}
            lead={lead}
            busy={busy}
            canSendEmail={canSendEmail}
            hasNext={hasNext}
            onSaveDraft={onSaveDraft}
            onSend={onSend}
            onAdvance={onAdvance}
            onSkip={onSkip}
          />
        ) : (
          <div className="flex flex-1 flex-col gap-3 p-4" role="status" aria-busy="true" aria-label="Loading draft">
            <Bone className="h-4 w-16" />
            <Bone className="h-10 w-full rounded-lg" />
            <Bone className="h-4 w-20" />
            <Bone className="h-10 w-full rounded-lg" />
            <Bone className="min-h-40 w-full flex-1 rounded-lg" />
          </div>
        )
      ) : phoneOnly ? (
        <div className="flex flex-1 flex-col justify-between p-5">
          <div>
            <p className="kicker">Call</p>
            <p className="mt-2 font-display text-3xl text-mist-100">{phone}</p>
            <p className="mt-3 max-w-md text-sm text-mist-400">
              Log the call when you hang up. Missed stays here. Connected leaves this queue.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {hasNext ? (
              <button
                type="button"
                onClick={onSkip}
                className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-mist-300 hover:bg-white/5"
              >
                Next
              </button>
            ) : null}
            <Lockable>
              <button
                type="button"
                disabled={busy || editLocked}
                onClick={() => {
                  if (onLogCall) onLogCall();
                  else void onMarkContacted(lead.id, "phone", { promptNote: true });
                }}
                title={
                  editLocked
                    ? lockHint
                    : "Log the call. Missed stays here; connected leaves."
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-aurora-400 px-5 text-sm font-medium text-on-accent disabled:opacity-50"
              >
                {busy ? <Spinner className="h-3.5 w-3.5" /> : <PhoneIcon className="h-3.5 w-3.5" />}
                Call
              </button>
            </Lockable>
          </div>
        </div>
      ) : (
        <p className="p-5 text-sm text-mist-400">Nothing to send for this lead.</p>
      )}
    </div>
  );
}

function EmailComposer({
  lead,
  busy,
  canSendEmail,
  hasNext,
  onSaveDraft,
  onSend,
  onAdvance,
  onSkip,
}: {
  lead: LeadWithOutreach;
  busy: boolean;
  canSendEmail: boolean;
  hasNext: boolean;
  onSaveDraft: (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
    opts?: { silent?: boolean },
  ) => Promise<void>;
  onSend: (outreachId: string) => Promise<boolean>;
  onAdvance: (ok: boolean) => void;
  onSkip: () => void;
}) {
  const outreach = lead.outreach!;
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const initialTo = outreach.toEmail ?? lead.emails[0] ?? "";
  const [toEmail, setToEmail] = useState(initialTo);
  const [subject, setSubject] = useState(outreach.subject ?? "");
  const [body, setBody] = useState(outreach.body ?? "");
  const [saved, setSaved] = useState({
    subject: outreach.subject ?? "",
    body: outreach.body ?? "",
    toEmail: initialTo,
  });
  const [saving, setSaving] = useState(false);
  const dirty =
    subject !== saved.subject || body !== saved.body || toEmail !== saved.toEmail;
  const addressOk = Boolean(parseRecipientEmail(toEmail));

  const persist = async () => {
    if (!dirty || editLocked) return;
    setSaving(true);
    try {
      await onSaveDraft(
        outreach.id,
        { subject, body, toEmail: toEmail || null },
        { silent: true },
      );
      setSaved({ subject, body, toEmail });
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (editLocked || busy || !addressOk) return;
    try {
      await persist();
    } catch {
      return;
    }
    const ok = await onSend(outreach.id);
    onAdvance(ok);
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="kicker">Draft</p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-mist-100">To</span>
          <input
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            onBlur={() => {
              const next = parseRecipientEmail(toEmail);
              if (next && next !== toEmail.trim()) setToEmail(next);
            }}
            disabled={editLocked}
            title={editLocked ? lockHint : undefined}
            placeholder="name@company.com"
            className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-mist-100 outline-none focus:border-aurora-400/60 disabled:opacity-60"
          />
          {toEmail.trim() && !addressOk ? (
            <span className="mt-1 block text-[11px] text-rose-300">
              Needs a real address (name@example.com).
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-mist-100">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={editLocked}
            title={editLocked ? lockHint : undefined}
            className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-mist-100 outline-none focus:border-aurora-400/60 disabled:opacity-60"
          />
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-mist-100">Body</span>
          <PitchEditor
            value={body}
            onChange={setBody}
            placeholder="Email body…"
            disabled={editLocked}
          />
        </div>
        {outreach.status === "failed" && outreach.error ? (
          <p className="text-xs text-rose-300/90">{outreach.error}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-3">
        {dirty ? (
          <button
            type="button"
            onClick={() => void persist().catch(() => undefined)}
            disabled={saving || editLocked}
            className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-mist-300 hover:bg-white/5 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : null}
        {hasNext ? (
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-mist-300 hover:bg-white/5"
          >
            Next
          </button>
        ) : null}
        <Lockable>
          <button
            type="button"
            disabled={busy || saving || editLocked || !addressOk}
            onClick={() => void send()}
            title={
              editLocked
                ? lockHint
                : canSendEmail
                  ? hasNext
                    ? "Send this email and open the next lead"
                    : "Send"
                  : "Send (simulate)"
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-aurora-400 px-5 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <SendIcon className="h-3.5 w-3.5" />}
            {hasNext ? "Send and next" : "Send"}
          </button>
        </Lockable>
      </div>
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactMethod, LeadWithOutreach } from "@/lib/types";
import { loadWarmupProfile, warmupStatus } from "@/lib/email/warmup";
import { Spinner } from "@/components/ui";
import { MailIcon, PencilIcon, PhoneIcon, SendIcon } from "@/components/icons";
import { useStableDuringLoad } from "./skeletons";
import { isOutreachReadyStatus } from "@/lib/lead-lanes";
import { VirtualColumnList } from "./virtual-list";
import { Lockable, useBoardLockUi } from "./board-lock";

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
 * One send list: drafted emails and phone-only leads.
 * Undrafted emails stay off the list until Draft remaining.
 * Send is the per-lead human gate (ADR 0029). A successful send leaves the list.
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
  onOpenDraft,
  onSend,
  onDraftAll,
  onMarkContacted,
  onLogCall,
}: {
  leads: LeadWithOutreach[];
  /** Workspace DB count of emails sent from this board’s mailbox today. */
  sendsToday?: number;
  /** Board outreach profile (or board id) — mailbox age / ~N/day suggest. */
  warmupScopeId?: string | null;
  canSendEmail: boolean;
  /** Lead / outreach ids currently drafting or sending (concurrent OK). */
  busyIds?: readonly string[];
  /** Large boards page in — the list may gain rows until this finishes. */
  backfilling?: boolean;
  loadedCount?: number;
  totalCount?: number;
  onOpenInfo: (id: string) => void;
  onOpenDraft: (id: string) => void;
  onSend: (outreachId: string) => void | Promise<void>;
  onDraftAll: (opts?: { redraft?: boolean }) => Promise<void>;
  onMarkContacted: (
    leadId: string,
    method: ContactMethod,
    opts?: { promptNote?: boolean; missed?: boolean },
  ) => Promise<void>;
  /** Phone-only: open the call log without leaving the list yet. */
  onLogCall?: (leadId: string) => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const busySet = useMemo(() => new Set(busyIds), [busyIds]);
  const [readyChannel, setReadyChannel] = useState<ReadyChannelFilter>("all");
  const [drafting, setDrafting] = useState<null | "remaining" | "redraft">(null);
  const skipReadyChannelPersist = useRef(true);

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

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
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
        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
        aria-label="Send list"
        className="flex min-h-0 flex-1 flex-col rounded-xl2 border border-white/10 bg-ink-950/40"
      >
        {rows.length === 0 ? (
          <div className="m-3 rounded-xl2 border border-dashed border-white/10 px-6 py-10 text-center">
            <p className="text-sm text-mist-300">
              {backfilling
                ? "Loading the send list…"
                : emptyCopy(leads, readyChannel, draftRemainingCount)}
            </p>
          </div>
        ) : (
          <VirtualColumnList
            items={rows}
            estimateSize={76}
            padding={0}
            gap={0}
            itemClassName=""
            renderItem={(lead, i) => (
              <OutreachRow
                lead={lead}
                busy={
                  busySet.has(lead.id) ||
                  (!!lead.outreach?.id && busySet.has(lead.outreach.id))
                }
                canSendEmail={canSendEmail}
                showDivider={i > 0}
                onOpenInfo={() => onOpenInfo(lead.id)}
                onOpenDraft={() => onOpenDraft(lead.id)}
                onSend={() =>
                  lead.outreach ? onSend(lead.outreach.id) : Promise.resolve()
                }
                onMarkContacted={(method, opts) =>
                  onMarkContacted(lead.id, method, opts)
                }
                onLogCall={onLogCall ? () => onLogCall(lead.id) : undefined}
              />
            )}
          />
        )}
      </section>
    </div>
  );
}

function OutreachRow({
  lead,
  busy,
  canSendEmail,
  showDivider,
  onOpenInfo,
  onOpenDraft,
  onSend,
  onMarkContacted,
  onLogCall,
}: {
  lead: LeadWithOutreach;
  busy: boolean;
  canSendEmail: boolean;
  showDivider: boolean;
  onOpenInfo: () => void;
  onOpenDraft: () => void;
  onSend: () => void | Promise<void>;
  onMarkContacted: (
    method: ContactMethod,
    opts?: { promptNote?: boolean; missed?: boolean },
  ) => Promise<void>;
  onLogCall?: () => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  const phoneOnly = !email && Boolean(phone);
  const subject = lead.outreach?.subject?.trim() ?? "";

  return (
    <div
      className={`flex min-w-0 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.03] ${
        showDivider ? "border-t border-white/10" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpenInfo}
        className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-1 focus-visible:ring-aurora-400/50"
      >
        <span className="block truncate text-sm font-medium text-mist-100">
          {lead.company}
        </span>
        {email ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-mist-400">
            <MailIcon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate" title={email}>
              {email}
            </span>
          </span>
        ) : phone ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-mist-400">
            <PhoneIcon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate" title={phone}>
              {phone}
            </span>
          </span>
        ) : null}
        {email && subject ? (
          <span
            className="mt-0.5 block truncate text-xs text-mist-500"
            title={subject}
          >
            {subject}
          </span>
        ) : null}
        {lead.outreach?.status === "failed" && lead.outreach.error ? (
          <span className="mt-1 line-clamp-2 block text-[11px] text-rose-300/90">
            {lead.outreach.error}
          </span>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {email ? (
          <>
            <button
              type="button"
              onClick={onOpenDraft}
              aria-label="Edit draft"
              title="Edit draft"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-mist-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-400/70"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <Lockable>
              <button
                type="button"
                disabled={busy || editLocked}
                onClick={() => void onSend()}
                title={
                  editLocked
                    ? lockHint
                    : canSendEmail
                      ? "Send"
                      : "Send (simulate)"
                }
                className="inline-flex h-9 min-h-9 items-center gap-1.5 rounded-full bg-aurora-400 px-3.5 text-sm font-medium text-on-accent disabled:opacity-50"
              >
                {busy ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <SendIcon className="h-3.5 w-3.5" />
                )}
                Send
              </button>
            </Lockable>
          </>
        ) : phoneOnly ? (
          <Lockable>
            <button
              type="button"
              disabled={busy || editLocked}
              onClick={() => {
                if (onLogCall) onLogCall();
                else void onMarkContacted("phone", { promptNote: true });
              }}
              aria-label={
                editLocked
                  ? lockHint
                  : "Log a call — stays in the list until you save as connected"
              }
              title={
                editLocked
                  ? lockHint
                  : "Log the call. Missed stays in the list; connected leaves it."
              }
              className="inline-flex h-9 min-h-9 items-center gap-1.5 rounded-full bg-aurora-400 px-3.5 text-sm font-medium text-on-accent disabled:opacity-50"
            >
              {busy ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <PhoneIcon className="h-3.5 w-3.5" />
              )}
              Call
            </button>
          </Lockable>
        ) : null}
      </div>
    </div>
  );
}

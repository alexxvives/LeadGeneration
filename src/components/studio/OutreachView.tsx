"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactMethod, LeadWithOutreach } from "@/lib/types";
import { loadWarmupProfile, warmupStatus } from "@/lib/email/warmup";
import { Spinner } from "@/components/ui";
import {
  CheckIcon,
  EyeIcon,
  FormIcon,
  InfoIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SendIcon,
} from "@/components/icons";
import { useStableDuringLoad } from "./skeletons";

type OutreachBucket = "review" | "ready" | "contacted";
/** Ready-column contact-channel filter. */
type ReadyChannelFilter = "all" | "email" | "phone";

/** Any pipeline stage past New counts as contacted in the Outreach queue. */
function isContacted(lead: LeadWithOutreach): boolean {
  const methods = lead.contactMethods ?? [];
  const reachedOtherwise =
    methods.includes("phone") || methods.includes("contact_form");
  // A bounce is not contact — strip email and treat as New unless they were
  // reached another way or later moved to conversation / closed.
  if (lead.outreach?.deliveryStatus === "bounced" && !reachedOtherwise) {
    const stage = lead.crmStage;
    return stage === "in_conversation" || stage === "closed";
  }
  if (lead.outreach?.status === "sent") return true;
  if (reachedOtherwise) return true;
  const stage = lead.crmStage;
  return (
    stage === "contacted" ||
    stage === "in_conversation" ||
    stage === "closed" ||
    stage === "not_interested"
  );
}

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

function bucketOf(lead: LeadWithOutreach): OutreachBucket | null {
  if (isContacted(lead)) return "contacted";
  const email = leadEmail(lead);
  const phone = leadPhone(lead);

  // Phone-only → Ready (call path; no email draft).
  if (!email && phone) return "ready";
  // No email and no phone → hide from Outreach queue.
  if (!email) return null;

  // Email leads only in Contact Draft / Ready send path.
  const o = lead.outreach;
  if (
    o?.status === "approved" ||
    o?.status === "sending" ||
    o?.status === "failed"
  ) {
    return "ready";
  }
  if (!o || o.status === "draft" || o.status === "rejected") {
    return "review";
  }
  return null;
}

/** Email lead in Contact Draft that still needs a first write (or after reject). */
export function needsOutreachDraft(lead: LeadWithOutreach): boolean {
  if (!leadEmail(lead)) return false;
  if (isContacted(lead)) return false;
  const s = lead.outreach?.status;
  return !s || s === "rejected";
}

/** Email lead in Contact Draft that already has a draft to rewrite. */
export function canRedraftOutreach(lead: LeadWithOutreach): boolean {
  if (!leadEmail(lead)) return false;
  if (isContacted(lead)) return false;
  return lead.outreach?.status === "draft";
}

/** Company A–Z (stable). */
function byCompany(a: LeadWithOutreach, b: LeadWithOutreach): number {
  return a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
}

/** Contacted: newest sends first, then company. */
function byContactedRecent(a: LeadWithOutreach, b: LeadWithOutreach): number {
  const aSent = a.outreach?.sentAt ?? "";
  const bSent = b.outreach?.sentAt ?? "";
  if (aSent !== bSent) return bSent.localeCompare(aSent);
  return byCompany(a, b);
}

const BUCKET_META: Record<
  OutreachBucket,
  { title: string; hint: string; empty: string }
> = {
  review: {
    title: "Contact Draft",
    hint: "Create or review a draft",
    empty: "No email drafts waiting — approve moves them to Ready.",
  },
  ready: {
    title: "Ready to Contact",
    hint: "Approved emails & phone-only leads",
    empty: "Approve a draft, or add a phone-only lead, to fill this column.",
  },
  contacted: {
    title: "Contacted",
    hint: "Sent emails and logged contacts — open a row to view the message",
    empty: "No contacts logged yet.",
  },
};

function emptyCopy(
  bucket: OutreachBucket,
  leads: LeadWithOutreach[],
  channel: ReadyChannelFilter,
): string {
  if (leads.length === 0) {
    return "No leads on this board yet — run a search or import.";
  }
  if (bucket === "ready" && channel === "phone") {
    return "No phone-only leads in Ready. Switch to All or Email.";
  }
  if (bucket === "ready" && channel === "email") {
    return "No email-ready leads. Approve a draft in Contact Draft.";
  }
  if (bucket === "review") {
    const hasEmail = leads.some((l) => Boolean(leadEmail(l)));
    if (!hasEmail) {
      return "No email addresses on this board — phone-only leads skip to Ready.";
    }
  }
  return BUCKET_META[bucket].empty;
}

function contactedDayHint(sentToday: number, softCap: number): string {
  if (sentToday >= softCap) {
    return `${sentToday} sent today · over ~${softCap}/day suggest`;
  }
  return `${sentToday} sent today · ~${softCap}/day suggest`;
}

/**
 * Compact 3-column send queue: Review → Ready → Contacted.
 * Phone-only leads land in Ready (no email draft required).
 * Draft/Ready: fit desc, then company A–Z. Contacted: newest send first.
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
  onCreateDraft,
  onApprove,
  onApproveAndSend,
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
  /** Large boards page in — Contacted may gain rows until this finishes. */
  backfilling?: boolean;
  loadedCount?: number;
  totalCount?: number;
  onOpenInfo: (id: string) => void;
  onOpenDraft: (id: string) => void;
  onCreateDraft: (id: string) => Promise<void>;
  onApprove: (leadId: string) => Promise<void>;
  /** Contact Draft: approve + send without visiting Ready. */
  onApproveAndSend: (leadId: string) => Promise<void>;
  onSend: (outreachId: string) => void | Promise<void>;
  onDraftAll: (opts?: { redraft?: boolean }) => Promise<void>;
  onMarkContacted: (
    leadId: string,
    method: ContactMethod,
    opts?: { promptNote?: boolean; missed?: boolean },
  ) => Promise<void>;
  /** Ready phone-only: open the call log without moving to Contacted yet. */
  onLogCall?: (leadId: string) => void;
}) {
  const busySet = useMemo(() => new Set(busyIds), [busyIds]);
  const [readyChannel, setReadyChannel] = useState<ReadyChannelFilter>("all");
  const skipReadyChannelPersist = useRef(true);

  // Keep Ready-column channel filter across tab switches / Settings (session only).
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

  const grouped = useMemo(() => {
    const next: Record<OutreachBucket, LeadWithOutreach[]> = {
      review: [],
      ready: [],
      contacted: [],
    };
    for (const lead of leads) {
      const b = bucketOf(lead);
      if (b) next[b].push(lead);
    }
    if (readyChannel === "email") {
      next.ready = next.ready.filter((l) => Boolean(leadEmail(l)));
    } else if (readyChannel === "phone") {
      next.ready = next.ready.filter((l) => !leadEmail(l) && Boolean(leadPhone(l)));
    }
    return next;
  }, [leads, readyChannel]);

  const reviewRows = useStableDuringLoad(
    grouped.review,
    byCompany,
    backfilling,
  );
  const readyRows = useStableDuringLoad(
    grouped.ready,
    byCompany,
    backfilling,
  );
  const contactedRows = useStableDuringLoad(
    grouped.contacted,
    byContactedRecent,
    backfilling,
  );
  const groups: Record<OutreachBucket, LeadWithOutreach[]> = {
    review: reviewRows,
    ready: readyRows,
    contacted: contactedRows,
  };

  const softCap = warmupStatus(loadWarmupProfile(warmupScopeId)).softCap;
  const overSoftCap = sendsToday >= softCap;

  const draftAllRemaining = useMemo(
    () => leads.some(needsOutreachDraft),
    [leads],
  );
  const redraftAllAvailable = useMemo(
    () => !draftAllRemaining && leads.some(canRedraftOutreach),
    [draftAllRemaining, leads],
  );

  const columns: OutreachBucket[] = ["review", "ready", "contacted"];

  return (
    <div data-tour="outreach-queue" className="flex h-full min-h-0 flex-col gap-3">
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
          … top of each column first
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3 lg:items-stretch">
        {columns.map((key) => {
          const meta = BUCKET_META[key];
          const rows = groups[key];
          return (
            <section
              key={key}
              className="flex min-h-0 flex-col rounded-xl2 border border-white/10 bg-ink-950/40"
            >
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-white/5 px-3 py-2.5">
                <div className="min-w-0">
                  <h3 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-mist-500">
                    {meta.title}
                    <span className="tabular-nums text-mist-400">{rows.length}</span>
                    {backfilling ? (
                      <span
                        role="status"
                        title="More leads are still loading"
                        aria-label="More leads are still loading"
                      >
                        <Spinner className="h-3 w-3 text-mist-400" />
                      </span>
                    ) : null}
                  </h3>
                  <p
                    className={`mt-0.5 text-[11px] ${
                      key === "contacted" && overSoftCap
                        ? "text-amber-300/90"
                        : "text-mist-600"
                    }`}
                    title={
                      key === "contacted"
                        ? "Soft recommend for this board’s inbox (Settings → mailbox age). Warning only — not a hard block."
                        : undefined
                    }
                  >
                    {key === "contacted"
                      ? contactedDayHint(sendsToday, softCap)
                      : meta.hint}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {key === "ready" ? (
                    <div
                      className="inline-flex rounded-full border border-white/10 bg-ink-900/60 p-0.5"
                      role="group"
                      aria-label="Filter Ready by contact channel"
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
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              active
                                ? "bg-aurora-400 text-on-accent"
                                : "text-mist-400 hover:text-mist-100"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {key === "review" && (draftAllRemaining || redraftAllAvailable) ? (
                    <button
                      type="button"
                      onClick={() =>
                        void onDraftAll(
                          redraftAllAvailable ? { redraft: true } : undefined,
                        )
                      }
                      disabled={busySet.has("draft-all")}
                      title={
                        redraftAllAvailable
                          ? "Rewrite every Contact Draft from the active profile"
                          : "Draft remaining email leads — they stay in Contact Draft until Approve"
                      }
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-medium text-on-accent disabled:opacity-50"
                    >
                      {busySet.has("draft-all") ? (
                        <Spinner className="h-3 w-3" />
                      ) : redraftAllAvailable ? (
                        <PencilIcon className="h-3 w-3" />
                      ) : (
                        <CheckIcon className="h-3 w-3" />
                      )}
                      {redraftAllAvailable ? "Re-draft all" : "Draft all"}
                    </button>
                  ) : null}
                </div>
              </div>

              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {rows.length === 0 ? (
                  <li className="px-3 py-6 text-center text-[11px] text-mist-600">
                    {backfilling && key === "contacted"
                      ? "Loading contacted leads…"
                      : emptyCopy(key, leads, readyChannel)}
                  </li>
                ) : (
                  rows.map((lead, i) => (
                    <OutreachRow
                      key={lead.id}
                      lead={lead}
                      bucket={key}
                      busy={
                        busySet.has(lead.id) ||
                        (!!lead.outreach?.id && busySet.has(lead.outreach.id))
                      }
                      canSendEmail={canSendEmail}
                      showDivider={i > 0}
                      onOpenInfo={() => onOpenInfo(lead.id)}
                      onOpenDraft={() => onOpenDraft(lead.id)}
                      onCreateDraft={() => onCreateDraft(lead.id)}
                      onApprove={() => onApprove(lead.id)}
                      onApproveAndSend={() => onApproveAndSend(lead.id)}
                      onSend={() =>
                        lead.outreach ? onSend(lead.outreach.id) : Promise.resolve()
                      }
                      onMarkContacted={(method, opts) =>
                        onMarkContacted(lead.id, method, opts)
                      }
                      onLogCall={
                        onLogCall ? () => onLogCall(lead.id) : undefined
                      }
                    />
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const ACTION_BTN =
  "inline-flex h-6 min-h-6 items-center justify-center gap-1 rounded-full text-[11px] font-medium leading-none";
const ACTION_ICON_BTN = `${ACTION_BTN} w-6 min-w-6 px-0`;
const ACTION_TEXT_BTN = `${ACTION_BTN} min-w-[1.5rem] px-2`;

function OutreachRow({
  lead,
  bucket,
  busy,
  canSendEmail,
  showDivider,
  onOpenInfo,
  onOpenDraft,
  onCreateDraft,
  onApprove,
  onApproveAndSend,
  onSend,
  onMarkContacted,
  onLogCall,
}: {
  lead: LeadWithOutreach;
  bucket: OutreachBucket;
  busy: boolean;
  canSendEmail: boolean;
  showDivider: boolean;
  onOpenInfo: () => void;
  onOpenDraft: () => void;
  onCreateDraft: () => Promise<void>;
  onApprove: () => Promise<void>;
  onApproveAndSend: () => Promise<void>;
  onSend: () => void | Promise<void>;
  onMarkContacted: (
    method: ContactMethod,
    opts?: { promptNote?: boolean; missed?: boolean },
  ) => Promise<void>;
  onLogCall?: () => void;
}) {
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  const phoneOnly = !email && Boolean(phone);
  const [pickingMethod, setPickingMethod] = useState(false);
  const methods = lead.contactMethods ?? [];
  const sent = lead.outreach?.status === "sent";
  // Sent email already implies the channel — don’t nag “register” during a
  // brief client merge gap where contactMethods is still empty.
  const needsMethod =
    bucket === "contacted" && methods.length === 0 && !sent;

  const hasDraft = Boolean(lead.outreach);
  const openComposer = () => {
    if (bucket === "contacted") {
      // Info pane has Notes (dated "Email sent"); draft is via draft button.
      onOpenInfo();
      return;
    }
    if (phoneOnly) {
      onOpenInfo();
      return;
    }
    if (bucket === "review") {
      if (hasDraft) onOpenDraft();
      else void onCreateDraft();
      return;
    }
    onOpenDraft();
  };

  return (
    <li
      className={`flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.03] ${
        showDivider ? "border-t border-white/10" : ""
      } ${needsMethod ? "bg-amber-400/[0.06]" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openComposer}
            className="min-w-0 truncate rounded-md text-left text-sm font-medium text-mist-100 outline-none hover:text-aurora-200 focus-visible:ring-1 focus-visible:ring-aurora-400/50"
          >
            {lead.company}
          </button>
          <button
            type="button"
            onClick={onOpenInfo}
            className={`shrink-0 rounded p-0.5 outline-none focus-visible:ring-1 focus-visible:ring-aurora-400/50 ${
              needsMethod
                ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-400/30"
                : "text-mist-500 hover:bg-white/10 hover:text-mist-100"
            }`}
            aria-label={
              needsMethod
                ? `Register how you contacted ${lead.company}`
                : `Lead info for ${lead.company}`
            }
            title={needsMethod ? "How contacted?" : "Lead info"}
          >
            <InfoIcon className="h-3 w-3" />
          </button>
        </div>
        {email ? (
          <button
            type="button"
            onClick={openComposer}
            className="mt-0.5 flex w-full min-w-0 items-center gap-1 truncate rounded-md text-left text-[11px] text-mist-500 outline-none hover:text-mist-300 focus-visible:ring-1 focus-visible:ring-aurora-400/50"
          >
            <MailIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{email}</span>
          </button>
        ) : phone ? (
          <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] text-mist-500">
            <PhoneIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{phone}</span>
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-mist-600">No email or phone</p>
        )}
        {needsMethod ? (
          <p className="mt-1 text-[10px] font-medium text-amber-300/90">
            How contacted? — open to register
          </p>
        ) : null}
        {lead.outreach?.status === "failed" && lead.outreach.error ? (
          <p className="mt-1 line-clamp-2 text-[10px] text-rose-300/90">{lead.outreach.error}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {bucket === "review" && (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (hasDraft) onOpenDraft();
                else void onCreateDraft();
              }}
              aria-label={hasDraft ? "Review draft" : "Create draft"}
              title={
                hasDraft
                  ? "Open draft — Approve & send in the drawer"
                  : email
                    ? "Create draft from active profile"
                    : "Create draft (add email in the composer if needed)"
              }
              className={`${ACTION_ICON_BTN} border border-white/15 text-mist-300 hover:bg-white/5 disabled:opacity-50`}
            >
              {busy ? (
                <Spinner className="h-2.5 w-2.5" />
              ) : hasDraft ? (
                <EyeIcon className="h-2.5 w-2.5" />
              ) : (
                <PlusIcon className="h-2.5 w-2.5" />
              )}
            </button>
            <button
              type="button"
              disabled={busy || (!hasDraft && !email)}
              onClick={() => void onApprove()}
              aria-label="Approve draft — move to Ready"
              title={
                hasDraft
                  ? "Approve only — move to Ready to contact"
                  : email
                    ? "Create & approve — move to Ready"
                    : "Needs an email to draft"
              }
              className={`${ACTION_ICON_BTN} bg-amber-400 text-on-accent disabled:opacity-50`}
            >
              {busy ? <Spinner className="h-2.5 w-2.5" /> : <CheckIcon className="h-2.5 w-2.5" />}
            </button>
            <button
              type="button"
              disabled={busy || (!hasDraft && !email) || phoneOnly}
              onClick={() => void onApproveAndSend()}
              aria-label={
                canSendEmail ? "Approve and send email" : "Approve and send (simulate)"
              }
              title={
                phoneOnly
                  ? "Phone-only — use Ready to log a call"
                  : canSendEmail
                    ? "Approve & send now"
                    : "Approve & send (simulate)"
              }
              className={`${ACTION_ICON_BTN} bg-aurora-400 text-on-accent disabled:opacity-50`}
            >
              {busy ? <Spinner className="h-2.5 w-2.5" /> : <SendIcon className="h-2.5 w-2.5" />}
            </button>
          </div>
        )}
        {bucket === "ready" && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-end gap-1">
              {email && !phoneOnly ? (
                <button
                  type="button"
                  onClick={onOpenDraft}
                  aria-label="Edit draft"
                  title="Edit draft"
                  className={`${ACTION_ICON_BTN} border border-white/15 text-mist-300 hover:bg-white/5`}
                >
                  <PencilIcon className="h-2.5 w-2.5" />
                </button>
              ) : null}
              {email ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSend()}
                  aria-label={canSendEmail ? "Send" : "Send (simulate)"}
                  title={canSendEmail ? "Send" : "Send (simulate)"}
                  className={`${ACTION_ICON_BTN} bg-aurora-400 text-on-accent disabled:opacity-50`}
                >
                  {busy ? <Spinner className="h-2.5 w-2.5" /> : <SendIcon className="h-2.5 w-2.5" />}
                </button>
              ) : phoneOnly ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (onLogCall) onLogCall();
                    else void onMarkContacted("phone", { promptNote: true });
                  }}
                  aria-label="Log a call — stays in Ready until you save as connected"
                  title="Log the call. Missed stays in Ready; connected moves to Contacted."
                  className={`${ACTION_ICON_BTN} bg-aurora-400 text-on-accent disabled:opacity-50`}
                >
                  {busy ? <Spinner className="h-2.5 w-2.5" /> : <PhoneIcon className="h-2.5 w-2.5" />}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPickingMethod((v) => !v)}
                  className={`${ACTION_TEXT_BTN} border border-amber-400/40 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50`}
                >
                  Log contact
                </button>
              )}
            </div>
            {pickingMethod && !email && !phoneOnly ? (
              <div className="flex flex-wrap justify-end gap-1">
                {(
                  [
                    ["phone", "Called"],
                    ["contact_form", "Form"],
                  ] as const
                ).map(([method, label]) => (
                  <button
                    key={`${method}-${label}`}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPickingMethod(false);
                      void onMarkContacted(method, {
                        promptNote: true,
                      });
                    }}
                    className={`${ACTION_TEXT_BTN} border border-amber-400/30 bg-amber-400/10 text-amber-100 disabled:opacity-50`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        {bucket === "contacted" ? (
          needsMethod ? (
            <button
              type="button"
              onClick={openComposer}
              className={`${ACTION_TEXT_BTN} border border-amber-400/40 bg-amber-400/15 text-amber-100`}
            >
              Register
            </button>
          ) : (
            <div className="flex flex-wrap justify-end gap-1">
              {sent || methods.includes("email") ? (
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-aurora-400/10 text-aurora-200 ring-1 ring-aurora-400/30"
                  title="Email"
                  aria-label="Email"
                >
                  <MailIcon className="h-3 w-3" />
                </span>
              ) : null}
              {methods.includes("phone") ? (
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-400/10 text-sky-200 ring-1 ring-sky-400/30"
                  title="Phone"
                  aria-label="Phone"
                >
                  <PhoneIcon className="h-3 w-3" />
                </span>
              ) : null}
              {methods.includes("contact_form") ? (
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink-800/80 text-mist-300 ring-1 ring-ink-600/40"
                  title="Contact form"
                  aria-label="Contact form"
                >
                  <FormIcon className="h-3 w-3" />
                </span>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </li>
  );
}

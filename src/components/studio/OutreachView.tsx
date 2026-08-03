"use client";

import { useMemo, useState } from "react";
import type { ContactMethod, LeadWithOutreach } from "@/lib/types";
import { warmupStatus } from "@/lib/email/warmup";
import { FitMeter, Spinner } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import {
  ArrowIcon,
  CheckIcon,
  InfoIcon,
  MailIcon,
  PhoneIcon,
} from "@/components/icons";
import { useStableDuringLoad } from "./skeletons";

type OutreachBucket = "review" | "ready" | "contacted";
/** Ready-column contact-channel filter. */
type ReadyChannelFilter = "all" | "email" | "phone";

/** Any pipeline stage past New counts as contacted in the Outreach queue. */
function isContacted(lead: LeadWithOutreach): boolean {
  if (lead.outreach?.status === "sent") return true;
  const methods = lead.contactMethods ?? [];
  if (methods.includes("phone") || methods.includes("contact_form")) {
    return true;
  }
  const stage = lead.crmStage;
  return (
    stage === "contacted" ||
    stage === "in_conversation" ||
    stage === "closed" ||
    stage === "not_interested"
  );
}

function leadEmail(lead: LeadWithOutreach): string | null {
  const raw = lead.outreach?.toEmail ?? lead.emails[0] ?? null;
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

/** Fit desc, then company A–Z (stable when many share the same score). */
function byFitThenCompany(a: LeadWithOutreach, b: LeadWithOutreach): number {
  const fit = (b.fitScore ?? 0) - (a.fitScore ?? 0);
  if (fit !== 0) return fit;
  return a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
}

/** Contacted: newest sends first, then fit, then company. */
function byContactedRecent(a: LeadWithOutreach, b: LeadWithOutreach): number {
  const aSent = a.outreach?.sentAt ?? "";
  const bSent = b.outreach?.sentAt ?? "";
  if (aSent !== bSent) return bSent.localeCompare(aSent);
  return byFitThenCompany(a, b);
}

const BUCKET_META: Record<
  OutreachBucket,
  { title: string; hint: string; empty: string }
> = {
  review: {
    title: "Contact Draft",
    hint: "Create or review a draft",
    empty: "All leads here are approved or already contacted.",
  },
  ready: {
    title: "Ready to Contact",
    hint: "Approved drafts",
    empty: "Approve a draft in Contact Draft to move it here.",
  },
  contacted: {
    title: "Contacted",
    hint: "Sent emails and logged contacts — open a row to view the message",
    empty: "No contacts logged yet.",
  },
};

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
  canSendEmail,
  emailVerify = false,
  busyId,
  backfilling = false,
  loadedCount,
  totalCount,
  onOpenInfo,
  onOpenDraft,
  onCreateDraft,
  onApprove,
  onSend,
  onDraftAll,
  onSendAll,
  onMarkContacted,
}: {
  leads: LeadWithOutreach[];
  /** Workspace DB count of emails sent since local midnight. */
  sendsToday?: number;
  canSendEmail: boolean;
  emailVerify?: boolean;
  busyId: string | null;
  /** Large boards page in — Contacted may gain rows until this finishes. */
  backfilling?: boolean;
  loadedCount?: number;
  totalCount?: number;
  onOpenInfo: (id: string) => void;
  onOpenDraft: (id: string) => void;
  onCreateDraft: (id: string) => Promise<void>;
  onApprove: (leadId: string) => Promise<void>;
  onSend: (outreachId: string) => Promise<void>;
  onDraftAll: () => Promise<void>;
  onSendAll: () => Promise<void>;
  onMarkContacted: (
    leadId: string,
    method: ContactMethod,
    opts?: { promptNote?: boolean },
  ) => Promise<void>;
}) {
  const [readyChannel, setReadyChannel] = useState<ReadyChannelFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const companyTypes = useMemo(() => {
    const set = new Set<string>();
    for (const lead of leads) {
      const t = lead.companyType?.trim();
      if (t) set.add(t);
    }
    return [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [leads]);

  const typeFiltered = useMemo(() => {
    if (typeFilter === "all") return leads;
    return leads.filter(
      (l) => (l.companyType?.trim() || "") === typeFilter,
    );
  }, [leads, typeFilter]);

  const grouped = useMemo(() => {
    const next: Record<OutreachBucket, LeadWithOutreach[]> = {
      review: [],
      ready: [],
      contacted: [],
    };
    for (const lead of typeFiltered) {
      const b = bucketOf(lead);
      if (b) next[b].push(lead);
    }
    if (readyChannel === "email") {
      next.ready = next.ready.filter((l) => Boolean(leadEmail(l)));
    } else if (readyChannel === "phone") {
      next.ready = next.ready.filter((l) => !leadEmail(l) && Boolean(leadPhone(l)));
    }
    return next;
  }, [typeFiltered, readyChannel]);

  const reviewRows = useStableDuringLoad(
    grouped.review,
    byFitThenCompany,
    backfilling,
  );
  const readyRows = useStableDuringLoad(
    grouped.ready,
    byFitThenCompany,
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

  const softCap = warmupStatus().softCap;
  const overSoftCap = sendsToday >= softCap;

  const columns: OutreachBucket[] = ["review", "ready", "contacted"];

  return (
    <div data-tour="outreach-queue" className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 items-center gap-2 text-[11px] text-mist-500">
          <span className="shrink-0 uppercase tracking-wider">Type</span>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="max-w-[12rem] py-1.5 text-xs"
            aria-label="Filter outreach by lead type"
          >
            <option value="all">All types</option>
            {companyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </label>
        {backfilling ? (
          <p
            className="text-[11px] text-mist-500"
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
      </div>
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
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-mist-500">
                    {meta.title}
                    <span className="ml-1.5 tabular-nums text-mist-400">{rows.length}</span>
                  </h3>
                  <p
                    className={`mt-0.5 text-[11px] ${
                      key === "contacted" && overSoftCap
                        ? "text-amber-300/90"
                        : "text-mist-600"
                    }`}
                    title={
                      key === "contacted"
                        ? "Soft recommend from Settings → mailbox age. Warning only — not a hard block."
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
                  {key === "review" && rows.some((l) => !l.outreach) ? (
                    <button
                      type="button"
                      onClick={() => void onDraftAll()}
                      disabled={busyId === "draft-all"}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-medium text-on-accent disabled:opacity-50"
                    >
                      {busyId === "draft-all" ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <CheckIcon className="h-3 w-3" />
                      )}
                      Draft all
                    </button>
                  ) : null}
                  {key === "ready" && rows.some((l) => leadEmail(l)) ? (
                    <button
                      type="button"
                      onClick={() => void onSendAll()}
                      disabled={busyId === "send-all"}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-aurora-400 px-2.5 py-1 text-[11px] font-medium text-on-accent disabled:opacity-50"
                    >
                      {busyId === "send-all" ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <ArrowIcon className="h-3 w-3" />
                      )}
                      Send all
                    </button>
                  ) : null}
                </div>
              </div>

              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {rows.length === 0 ? (
                  <li className="px-3 py-6 text-center text-[11px] text-mist-600">
                    {backfilling && key === "contacted"
                      ? "Loading contacted leads…"
                      : meta.empty}
                  </li>
                ) : (
                  rows.map((lead, i) => (
                    <OutreachRow
                      key={lead.id}
                      lead={lead}
                      bucket={key}
                      busy={busyId === lead.id || busyId === lead.outreach?.id}
                      canSendEmail={canSendEmail}
                      emailVerify={emailVerify}
                      showDivider={i > 0}
                      onOpenInfo={() => onOpenInfo(lead.id)}
                      onOpenDraft={() => onOpenDraft(lead.id)}
                      onCreateDraft={() => onCreateDraft(lead.id)}
                      onApprove={() => onApprove(lead.id)}
                      onSend={() =>
                        lead.outreach ? onSend(lead.outreach.id) : Promise.resolve()
                      }
                      onMarkContacted={(method, opts) =>
                        onMarkContacted(lead.id, method, opts)
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
  "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-medium leading-none";

function OutreachRow({
  lead,
  bucket,
  busy,
  canSendEmail,
  emailVerify,
  showDivider,
  onOpenInfo,
  onOpenDraft,
  onCreateDraft,
  onApprove,
  onSend,
  onMarkContacted,
}: {
  lead: LeadWithOutreach;
  bucket: OutreachBucket;
  busy: boolean;
  canSendEmail: boolean;
  emailVerify: boolean;
  showDivider: boolean;
  onOpenInfo: () => void;
  onOpenDraft: () => void;
  onCreateDraft: () => Promise<void>;
  onApprove: () => Promise<void>;
  onSend: () => Promise<void>;
  onMarkContacted: (
    method: ContactMethod,
    opts?: { promptNote?: boolean },
  ) => Promise<void>;
}) {
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  const phoneOnly = !email && Boolean(phone);
  const [pickingMethod, setPickingMethod] = useState(false);
  const methods = lead.contactMethods ?? [];
  const needsMethod = bucket === "contacted" && methods.length === 0;
  const sent = lead.outreach?.status === "sent";

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
        {bucket === "contacted" && sent ? (
          <p className="mt-1 text-[10px] font-medium text-aurora-300/90">
            Sent
            {lead.outreach?.sentAt
              ? ` · ${new Date(lead.outreach.sentAt).toLocaleString()}`
              : ""}
          </p>
        ) : null}
        {lead.outreach?.status === "failed" && lead.outreach.error ? (
          <p className="mt-1 line-clamp-2 text-[10px] text-rose-300/90">{lead.outreach.error}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="origin-right scale-90">
          <FitMeter score={lead.fitScore} />
        </div>
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
                  ? "Open draft to edit"
                  : email
                    ? "Create draft from active profile"
                    : "Create draft (add email in the composer if needed)"
              }
              className={`${ACTION_BTN} border border-white/15 text-mist-300 hover:bg-white/5 disabled:opacity-50`}
            >
              {busy ? <Spinner className="h-2.5 w-2.5" /> : hasDraft ? "Review" : "Create"}
            </button>
            <button
              type="button"
              disabled={busy || (!hasDraft && !email)}
              onClick={() => void onApprove()}
              aria-label="Approve draft"
              title={
                hasDraft
                  ? "Approve — move to Ready to contact"
                  : email
                    ? "Create & approve — move to Ready"
                    : "Needs an email to draft"
              }
              className={`${ACTION_BTN} bg-amber-400 text-on-accent disabled:opacity-50`}
            >
              {busy ? <Spinner className="h-2.5 w-2.5" /> : <ArrowIcon className="h-2.5 w-2.5" />}
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
                  className={`${ACTION_BTN} border border-white/15 text-mist-300 hover:bg-white/5`}
                >
                  Edit
                </button>
              ) : null}
              {email ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSend()}
                  aria-label={
                    busy && emailVerify
                      ? "Verifying email"
                      : canSendEmail
                        ? "Send"
                        : "Send (simulate)"
                  }
                  title={
                    busy && emailVerify
                      ? "Verifying email is deliverable…"
                      : canSendEmail
                        ? "Send"
                        : "Send (simulate)"
                  }
                  className={`${ACTION_BTN} bg-aurora-400 text-on-accent disabled:opacity-50`}
                >
                  {busy ? <Spinner className="h-2.5 w-2.5" /> : <ArrowIcon className="h-2.5 w-2.5" />}
                </button>
              ) : phoneOnly ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onMarkContacted("phone", { promptNote: true })}
                  aria-label="Mark called — move to Contacted"
                  title="After you call — move to Contacted and add a note"
                  className={`${ACTION_BTN} bg-aurora-400 text-on-accent disabled:opacity-50`}
                >
                  {busy ? <Spinner className="h-2.5 w-2.5" /> : <ArrowIcon className="h-2.5 w-2.5" />}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPickingMethod((v) => !v)}
                  className={`${ACTION_BTN} border border-amber-400/40 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50`}
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
                    key={method}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPickingMethod(false);
                      void onMarkContacted(method, { promptNote: true });
                    }}
                    className={`${ACTION_BTN} border border-amber-400/30 bg-amber-400/10 text-amber-100 disabled:opacity-50`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {busy && emailVerify ? (
              <p className="max-w-[9rem] text-right text-[9px] leading-tight text-mist-400">
                Verifying email…
              </p>
            ) : null}
          </div>
        )}
        {bucket === "contacted" ? (
          <button
            type="button"
            onClick={openComposer}
            className={`${ACTION_BTN} ${
              needsMethod
                ? "border border-amber-400/40 bg-amber-400/15 text-amber-100"
                : sent
                  ? "border border-aurora-400/30 bg-aurora-400/10 text-aurora-200 hover:bg-aurora-400/15"
                  : "border border-white/15 text-mist-400 hover:bg-white/5"
            }`}
          >
            {sent ? "Email" : "Register"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

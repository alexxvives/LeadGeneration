"use client";

import { useState } from "react";
import type { ContactMethod, LeadWithOutreach } from "@/lib/types";
import { FitMeter, Spinner } from "@/components/ui";
import {
  ArrowIcon,
  CheckIcon,
  InfoIcon,
  MailIcon,
} from "@/components/icons";

type OutreachBucket = "review" | "ready" | "contacted";

function isContacted(lead: LeadWithOutreach): boolean {
  if (lead.outreach?.status === "sent") return true;
  if (lead.contactMethod === "phone" || lead.contactMethod === "contact_form") {
    return true;
  }
  return lead.crmStage === "contacted";
}

function bucketOf(lead: LeadWithOutreach): OutreachBucket | null {
  if (isContacted(lead)) return "contacted";
  const o = lead.outreach;
  // Ready after Approve (or send-in-flight / last send failed).
  if (
    o?.status === "approved" ||
    o?.status === "sending" ||
    o?.status === "failed"
  ) {
    return "ready";
  }
  // Draft, undeliverable (needs a new To address), or no outreach yet.
  if (!o || o.status === "draft" || o.status === "rejected") {
    return "review";
  }
  return null;
}

const BUCKET_META: Record<
  OutreachBucket,
  { title: string; hint: string; empty: string }
> = {
  review: {
    title: "Contact Draft",
    hint: "Create or review a draft — Approve moves it to Ready",
    empty: "All leads here are approved or already contacted.",
  },
  ready: {
    title: "Ready to Contact",
    hint: "Approved drafts — edit if needed, then send",
    empty: "Approve a draft in Contact Draft to move it here.",
  },
  contacted: {
    title: "Contacted",
    hint: "Emailed, called, or reached via form",
    empty: "No contacts logged yet.",
  },
};

/**
 * Compact 3-column send queue: Review → Ready → Contacted.
 * No-email leads can be marked contacted via phone / contact form (Ready).
 */
export function OutreachView({
  leads,
  canSendEmail,
  emailVerify = false,
  busyId,
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
  canSendEmail: boolean;
  /** When true, busy send shows verify copy. */
  emailVerify?: boolean;
  busyId: string | null;
  onOpenInfo: (id: string) => void;
  onOpenDraft: (id: string) => void;
  /** Contact Draft: draft from latest profile, then open composer. */
  onCreateDraft: (id: string) => Promise<void>;
  /** Yellow arrow: approve draft → Ready (creates draft first if needed). */
  onApprove: (leadId: string) => Promise<void>;
  onSend: (outreachId: string) => Promise<void>;
  onDraftAll: () => Promise<void>;
  onSendAll: () => Promise<void>;
  onMarkContacted: (leadId: string, method: ContactMethod) => Promise<void>;
}) {
  const groups: Record<OutreachBucket, LeadWithOutreach[]> = {
    review: [],
    ready: [],
    contacted: [],
  };
  for (const lead of leads) {
    const b = bucketOf(lead);
    if (b) groups[b].push(lead);
  }

  const total = groups.review.length + groups.ready.length + groups.contacted.length;
  const columns: OutreachBucket[] = ["review", "ready", "contacted"];

  return (
    <div data-tour="outreach-queue" className="flex h-full min-h-0 flex-col gap-3">
      {total === 0 ? (
        <p className="rounded-xl2 border border-white/10 bg-ink-900/40 px-5 py-8 text-center text-sm text-mist-400">
          No outreach yet. Run a search or import a list — drafts appear here to review.
        </p>
      ) : (
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
                    <p className="mt-0.5 text-[11px] text-mist-600">{meta.hint}</p>
                  </div>
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
                  {key === "ready" && rows.length > 0 ? (
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

                <ul className="min-h-0 flex-1 divide-y divide-white/10 overflow-y-auto overscroll-contain">
                  {rows.length === 0 ? (
                    <li className="px-3 py-6 text-center text-[11px] text-mist-600">
                      {meta.empty}
                    </li>
                  ) : (
                    rows.map((lead) => (
                      <OutreachRow
                        key={lead.id}
                        lead={lead}
                        bucket={key}
                        busy={busyId === lead.id || busyId === lead.outreach?.id}
                        canSendEmail={canSendEmail}
                        emailVerify={emailVerify}
                        onOpenInfo={() => onOpenInfo(lead.id)}
                        onOpenDraft={() => onOpenDraft(lead.id)}
                        onCreateDraft={() => onCreateDraft(lead.id)}
                        onApprove={() => onApprove(lead.id)}
                        onSend={() =>
                          lead.outreach ? onSend(lead.outreach.id) : Promise.resolve()
                        }
                        onMarkContacted={(method) => onMarkContacted(lead.id, method)}
                      />
                    ))
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
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
  onOpenInfo: () => void;
  onOpenDraft: () => void;
  onCreateDraft: () => Promise<void>;
  onApprove: () => Promise<void>;
  onSend: () => Promise<void>;
  onMarkContacted: (method: ContactMethod) => Promise<void>;
}) {
  const email = lead.outreach?.toEmail ?? lead.emails[0] ?? null;
  const [pickingMethod, setPickingMethod] = useState(false);

  // Email is the default Contacted path — only label non-email methods.
  const methodLabel =
    lead.contactMethod === "phone"
      ? "Called"
      : lead.contactMethod === "contact_form"
        ? "Contact form"
        : null;

  const hasDraft = Boolean(lead.outreach);
  // Contact Draft: create when missing; reopen existing unapproved drafts.
  // Ready/Contacted: open existing.
  const openComposer = () => {
    if (bucket === "review") {
      if (hasDraft) onOpenDraft();
      else void onCreateDraft();
      return;
    }
    onOpenDraft();
  };

  return (
    <li className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.03]">
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
            className="shrink-0 rounded p-0.5 text-mist-500 outline-none hover:bg-white/10 hover:text-mist-100 focus-visible:ring-1 focus-visible:ring-aurora-400/50"
            aria-label={`Lead info for ${lead.company}`}
            title="Lead info"
          >
            <InfoIcon className="h-3 w-3" />
          </button>
        </div>
        <button
          type="button"
          onClick={openComposer}
          className="mt-0.5 flex w-full min-w-0 items-center gap-1 truncate rounded-md text-left text-[11px] text-mist-500 outline-none hover:text-mist-300 focus-visible:ring-1 focus-visible:ring-aurora-400/50"
        >
          <MailIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{email ?? "No email"}</span>
        </button>
        {lead.outreach?.status === "failed" && lead.outreach.error ? (
          <p className="mt-1 line-clamp-2 text-[10px] text-rose-300/90">{lead.outreach.error}</p>
        ) : null}
        {bucket === "contacted" && methodLabel ? (
          <span className="mt-1 inline-flex rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/30">
            {methodLabel}
          </span>
        ) : null}
        {bucket === "contacted" && lead.contactMethod === "email" ? (
          <span className="mt-1 inline-flex rounded-full bg-aurora-400/15 px-1.5 py-0.5 text-[10px] font-medium text-aurora-300 ring-1 ring-inset ring-aurora-400/30">
            Emailed
          </span>
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
              <button
                type="button"
                onClick={onOpenDraft}
                className={`${ACTION_BTN} border border-white/15 text-mist-300 hover:bg-white/5`}
              >
                Edit
              </button>
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
            {pickingMethod && !email ? (
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
                      void onMarkContacted(method);
                    }}
                    className={`${ACTION_BTN} border border-amber-400/30 bg-amber-400/10 text-amber-100 disabled:opacity-50`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {busy && emailVerify ? (
              <p className="max-w-[9rem] text-right text-[9px] leading-tight text-amber-200/80">
                Verifying email…
              </p>
            ) : null}
          </div>
        )}
        {bucket === "contacted" && (
          <button
            type="button"
            onClick={onOpenDraft}
            className={`${ACTION_BTN} border border-white/15 text-mist-400 hover:bg-white/5`}
          >
            View
          </button>
        )}
      </div>
    </li>
  );
}

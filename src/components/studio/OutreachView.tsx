"use client";

import type { LeadWithOutreach } from "@/lib/types";
import { FitMeter, Spinner } from "@/components/ui";
import {
  ArrowIcon,
  CheckIcon,
  InfoIcon,
  MailIcon,
  SparkIcon,
} from "@/components/icons";

type OutreachBucket = "needs_draft" | "review" | "ready" | "sent";

function bucketOf(lead: LeadWithOutreach): OutreachBucket | null {
  const o = lead.outreach;
  if (o?.status === "sent") return "sent";
  if (o?.status === "approved") return "ready";
  if (o && (o.status === "draft" || o.status === "rejected" || o.status === "failed")) {
    return "review";
  }
  if (!o && lead.emails.length > 0) return "needs_draft";
  return null;
}

const BUCKET_META: Record<
  OutreachBucket,
  { title: string; hint: string; empty: string }
> = {
  needs_draft: {
    title: "Needs draft",
    hint: "Generate a first touch",
    empty: "All contactable leads have drafts.",
  },
  review: {
    title: "Review & approve",
    hint: "Edit, then approve to unlock send",
    empty: "Nothing waiting for approval.",
  },
  ready: {
    title: "Ready to send",
    hint: "Approved — deliver (or simulate)",
    empty: "No approved drafts yet.",
  },
  sent: {
    title: "Sent",
    hint: "Already delivered",
    empty: "No sends yet.",
  },
};

/**
 * Compact 4-column send queue: Needs draft → Review → Ready → Sent.
 * Edit opens draft-only; info icon opens the lead profile.
 */
export function OutreachView({
  leads,
  canSendEmail,
  busyId,
  onOpenInfo,
  onOpenDraft,
  onDraft,
  onDecide,
  onSend,
  onDraftAll,
  onApproveAll,
}: {
  leads: LeadWithOutreach[];
  canSendEmail: boolean;
  busyId: string | null;
  onOpenInfo: (id: string) => void;
  onOpenDraft: (id: string) => void;
  onDraft: (leadId: string) => Promise<void>;
  onDecide: (outreachId: string, decision: "approved" | "rejected") => Promise<void>;
  onSend: (outreachId: string) => Promise<void>;
  onDraftAll: () => Promise<void>;
  onApproveAll: () => Promise<void>;
}) {
  const groups: Record<OutreachBucket, LeadWithOutreach[]> = {
    needs_draft: [],
    review: [],
    ready: [],
    sent: [],
  };
  for (const lead of leads) {
    const b = bucketOf(lead);
    if (b) groups[b].push(lead);
  }

  const total =
    groups.needs_draft.length +
    groups.review.length +
    groups.ready.length +
    groups.sent.length;

  const columns: OutreachBucket[] = ["needs_draft", "review", "ready", "sent"];

  return (
    <div data-tour="outreach-queue" className="flex h-full min-h-0 flex-col gap-3">
      {total === 0 ? (
        <p className="rounded-xl2 border border-white/10 bg-ink-900/40 px-5 py-8 text-center text-sm text-mist-400">
          No outreach yet. Run a search, then come back here to draft and send.
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-4 lg:items-stretch">
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
                  {key === "needs_draft" && rows.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void onDraftAll()}
                      disabled={busyId === "draft-all"}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium text-mist-100 hover:bg-white/5 disabled:opacity-40"
                    >
                      {busyId === "draft-all" ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <SparkIcon className="h-3 w-3" />
                      )}
                      Generate all
                    </button>
                  ) : null}
                  {key === "review" && rows.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void onApproveAll()}
                      disabled={busyId === "approve-all"}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-medium text-ink-950 disabled:opacity-50"
                    >
                      {busyId === "approve-all" ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <CheckIcon className="h-3 w-3" />
                      )}
                      Approve all
                    </button>
                  ) : null}
                </div>

                <ul className="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto overscroll-contain">
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
                        onOpenInfo={() => onOpenInfo(lead.id)}
                        onOpenDraft={() => onOpenDraft(lead.id)}
                        onDraft={() => onDraft(lead.id)}
                        onApprove={() =>
                          lead.outreach
                            ? onDecide(lead.outreach.id, "approved")
                            : Promise.resolve()
                        }
                        onSend={() =>
                          lead.outreach ? onSend(lead.outreach.id) : Promise.resolve()
                        }
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

function OutreachRow({
  lead,
  bucket,
  busy,
  canSendEmail,
  onOpenInfo,
  onOpenDraft,
  onDraft,
  onApprove,
  onSend,
}: {
  lead: LeadWithOutreach;
  bucket: OutreachBucket;
  busy: boolean;
  canSendEmail: boolean;
  onOpenInfo: () => void;
  onOpenDraft: () => void;
  onDraft: () => Promise<void>;
  onApprove: () => Promise<void>;
  onSend: () => Promise<void>;
}) {
  const email = lead.outreach?.toEmail ?? lead.emails[0] ?? null;
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      <div className="flex min-w-0 items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-medium text-mist-100">{lead.company}</span>
            <button
              type="button"
              onClick={onOpenInfo}
              className="shrink-0 rounded p-0.5 text-mist-600 transition-colors hover:bg-white/5 hover:text-mist-300"
              aria-label={`Lead info for ${lead.company}`}
              title="Lead info"
            >
              <InfoIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-mist-500">
            <MailIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{email ?? "No email"}</span>
          </p>
          {lead.outreach?.status === "failed" && lead.outreach.error ? (
            <p className="mt-1 line-clamp-2 text-[10px] text-rose-300/90">{lead.outreach.error}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <FitMeter score={lead.fitScore} />
          {bucket === "review" && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={onOpenDraft}
                className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-mist-300 hover:bg-white/5"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onApprove()}
                aria-label="Approve"
                title="Approve"
                className="inline-flex items-center justify-center rounded-full bg-amber-400 p-1.5 text-ink-950 disabled:opacity-50"
              >
                {busy ? <Spinner className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
          {bucket === "ready" && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={onOpenDraft}
                className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-mist-300 hover:bg-white/5"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy || !email}
                onClick={() => void onSend()}
                className="inline-flex items-center gap-1 rounded-full bg-aurora-400 px-2.5 py-1 text-[11px] font-medium text-ink-950 disabled:opacity-50"
              >
                {busy ? <Spinner className="h-3 w-3" /> : <ArrowIcon className="h-3 w-3" />}
                {canSendEmail ? "Send" : "Send (simulate)"}
              </button>
            </div>
          )}
        </div>
      </div>
      {(bucket === "needs_draft" || bucket === "sent") && (
        <div className="flex flex-wrap items-center gap-1.5">
          {bucket === "needs_draft" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDraft()}
              className="inline-flex items-center gap-1 rounded-full bg-aurora-400 px-2.5 py-1 text-[11px] font-medium text-ink-950 disabled:opacity-50"
            >
              {busy ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3 w-3" />}
              Draft
            </button>
          )}
          {bucket === "sent" && (
            <button
              type="button"
              onClick={onOpenDraft}
              className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-mist-400 hover:bg-white/5"
            >
              View draft
            </button>
          )}
        </div>
      )}
    </li>
  );
}

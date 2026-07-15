"use client";

import type { LeadWithOutreach } from "@/lib/types";
import { FitMeter, Spinner, StatusPill } from "@/components/ui";
import { ArrowIcon, CheckIcon, MailIcon, SparkIcon } from "@/components/icons";

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
    hint: "Has email — generate a first touch",
    empty: "Every contactable lead already has a draft.",
  },
  review: {
    title: "Review & approve",
    hint: "Edit if needed, then approve to unlock send",
    empty: "Nothing waiting for approval.",
  },
  ready: {
    title: "Ready to send",
    hint: "Approved — one click to deliver (or simulate)",
    empty: "No approved drafts waiting to send.",
  },
  sent: {
    title: "Sent",
    hint: "Already delivered this run",
    empty: "No sends yet.",
  },
};

/**
 * Dedicated send queue — draft → approve → send is easier here than buried
 * inside the lead drawer. Clicking a row still opens the drawer for edits.
 */
export function OutreachView({
  leads,
  canSendEmail,
  busyId,
  onOpen,
  onDraft,
  onDecide,
  onSend,
  onDraftAll,
  onApproveAll,
}: {
  leads: LeadWithOutreach[];
  canSendEmail: boolean;
  busyId: string | null;
  onOpen: (id: string) => void;
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

  const actionable =
    groups.needs_draft.length + groups.review.length + groups.ready.length;

  return (
    <div data-tour="outreach-queue" className="space-y-8">
      <div className="flex flex-wrap items-end justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {groups.needs_draft.length > 0 && (
            <button
              type="button"
              onClick={() => void onDraftAll()}
              disabled={busyId === "draft-all"}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-40"
            >
              {busyId === "draft-all" ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <SparkIcon className="h-3.5 w-3.5" />
              )}
              Draft all ({groups.needs_draft.length})
            </button>
          )}
          {groups.review.length > 0 && (
            <button
              type="button"
              onClick={() => void onApproveAll()}
              disabled={busyId === "approve-all"}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {busyId === "approve-all" ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <CheckIcon className="h-3.5 w-3.5" />
              )}
              Approve all drafts ({groups.review.length})
            </button>
          )}
        </div>
      </div>

      {actionable === 0 && groups.sent.length === 0 ? (
        <p className="rounded-xl2 border border-white/10 bg-ink-900/40 px-5 py-8 text-center text-sm text-mist-400">
          No outreach yet. Run a search, then come back here to draft and send.
        </p>
      ) : null}

      {(["needs_draft", "review", "ready", "sent"] as const).map((key) => {
        const meta = BUCKET_META[key];
        const rows = groups[key];
        if (rows.length === 0 && key === "sent") return null;
        return (
          <section key={key}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-mist-500">
                  {meta.title}
                  <span className="ml-2 tabular-nums text-mist-400">{rows.length}</span>
                </h3>
                <p className="mt-0.5 text-xs text-mist-500">{meta.hint}</p>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="text-xs text-mist-600">{meta.empty}</p>
            ) : (
              <ul className="divide-y divide-white/5 overflow-hidden rounded-xl2 border border-white/10">
                {rows.map((lead) => (
                  <OutreachRow
                    key={lead.id}
                    lead={lead}
                    bucket={key}
                    busy={busyId === lead.id || busyId === lead.outreach?.id}
                    canSendEmail={canSendEmail}
                    onOpen={() => onOpen(lead.id)}
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
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function OutreachRow({
  lead,
  bucket,
  busy,
  canSendEmail,
  onOpen,
  onDraft,
  onApprove,
  onSend,
}: {
  lead: LeadWithOutreach;
  bucket: OutreachBucket;
  busy: boolean;
  canSendEmail: boolean;
  onOpen: () => void;
  onDraft: () => Promise<void>;
  onApprove: () => Promise<void>;
  onSend: () => Promise<void>;
}) {
  const email = lead.outreach?.toEmail ?? lead.emails[0] ?? null;
  return (
    <li className="flex flex-wrap items-center gap-3 bg-ink-900/30 px-4 py-3 transition-colors hover:bg-white/[0.03] sm:flex-nowrap">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-mist-100">{lead.company}</span>
          <FitMeter score={lead.fitScore} />
          {lead.outreach && <StatusPill status={lead.outreach.status} />}
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-mist-500">
          <MailIcon className="h-3 w-3 shrink-0" />
          {email ?? "No email"}
          {lead.outreach?.subject ? (
            <span className="truncate text-mist-600"> · {lead.outreach.subject}</span>
          ) : null}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {bucket === "needs_draft" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDraft()}
            className="inline-flex items-center gap-1 rounded-full bg-aurora-400 px-3 py-1.5 text-xs font-medium text-ink-950 disabled:opacity-50"
          >
            {busy ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3 w-3" />}
            Draft
          </button>
        )}
        {bucket === "review" && (
          <>
            <button
              type="button"
              onClick={onOpen}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-mist-300 hover:bg-white/5"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onApprove()}
              className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-medium text-ink-950 disabled:opacity-50"
            >
              {busy ? <Spinner className="h-3 w-3" /> : <CheckIcon className="h-3 w-3" />}
              Approve
            </button>
          </>
        )}
        {bucket === "ready" && (
          <button
            type="button"
            disabled={busy || !email}
            onClick={() => void onSend()}
            className="inline-flex items-center gap-1 rounded-full bg-aurora-400 px-3 py-1.5 text-xs font-medium text-ink-950 disabled:opacity-50"
          >
            {busy ? <Spinner className="h-3 w-3" /> : <ArrowIcon className="h-3 w-3" />}
            {canSendEmail ? "Send" : "Send (simulate)"}
          </button>
        )}
        {bucket === "sent" && (
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-mist-400 hover:bg-white/5"
          >
            View
          </button>
        )}
      </div>
    </li>
  );
}

"use client";

import type { FollowUp, LeadWithOutreach } from "@/lib/types";
import {
  canonicalizeFollowUp,
  followUpAuthorName,
  hasPendingTask,
  pendingUserFollowUpCount,
  resolveFollowUpKind,
  sortFollowUpsNewestFirst,
} from "@/lib/follow-ups";
import { shortLocation } from "@/lib/format-location";
import { CalendarIcon, DemoIcon, PinIcon, WaitingIcon } from "@/components/icons";
import { EmptyState } from "@/components/studio/StudioHelpers";
import { MarqueeText } from "@/components/studio/MarqueeText";
import { AuthorAvatar } from "@/components/studio/JournalEntries";

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function recentComments(
  followUps: FollowUp[] | undefined,
): Array<{ id: string; text: string; author: string | null }> {
  return sortFollowUpsNewestFirst(followUps ?? [])
    .filter((f) => {
      if (f.kind === "follow_up") return false;
      const kind = resolveFollowUpKind(f);
      return (kind === "note" || kind === "task") && f.note.trim();
    })
    .slice(0, 2)
    .map((f) => {
      const canon = canonicalizeFollowUp(f);
      return {
        id: canon.id,
        text: canon.note.trim(),
        author: followUpAuthorName(canon),
      };
    });
}

export function ConversationsView({
  leads,
  emptyHref,
  onOpen,
  onCompleteTask,
}: {
  leads: LeadWithOutreach[];
  emptyHref: string;
  onOpen: (id: string) => void;
  onCompleteTask?: (leadId: string) => void;
}) {
  const rows = [...leads]
    .filter((l) => (l.crmStage ?? "new") === "in_conversation")
    .sort((a, b) => {
      const aWait = hasPendingTask(a.followUps);
      const bWait = hasPendingTask(b.followUps);
      if (aWait !== bWait) return aWait ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });

  if (rows.length === 0) {
    return (
      <EmptyState
        actionHref={emptyHref}
        actionLabel="Open Pipeline"
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((lead) => {
        const pendingFollowUps = pendingUserFollowUpCount(lead.followUps);
        const waitingOnUs = hasPendingTask(lead.followUps);
        const comments = recentComments(lead.followUps);
        const name = lead.contactName?.trim() || lead.company || "Untitled";
        const cityCountry = shortLocation(lead.location);
        return (
          <article
            key={lead.id}
            className="glass card-hover flex min-w-0 max-w-full flex-col overflow-hidden rounded-xl2 p-4 sm:p-5"
          >
            <button
              type="button"
              onClick={() => onOpen(lead.id)}
              className="flex min-w-0 w-full flex-1 flex-col text-left"
            >
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="min-w-0 font-display text-base font-semibold leading-tight">
                    <MarqueeText>{name}</MarqueeText>
                  </h3>
                  {lead.contactName && lead.company ? (
                    <p className="mt-0.5 text-xs text-mist-400">
                      <MarqueeText>{lead.company}</MarqueeText>
                    </p>
                  ) : null}
                  {cityCountry ? (
                    <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-mist-400">
                      <PinIcon className="h-3 w-3 shrink-0" />
                      <MarqueeText
                        className="min-w-0 flex-1"
                        title={lead.location ?? cityCountry}
                      >
                        {cityCountry}
                      </MarqueeText>
                    </span>
                  ) : null}
                </div>
                {(waitingOnUs || lead.demoDone) ? (
                  <span className="inline-flex shrink-0 items-center gap-1">
                    {waitingOnUs ? (
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 shadow-[0_0_12px_rgba(247,185,85,0.35)] ring-1 ring-amber-400/45"
                        title="Waiting on us"
                        aria-label="Waiting on us"
                      >
                        <WaitingIcon className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                    {lead.demoDone ? (
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-aurora-400/20 text-aurora-300 ring-1 ring-aurora-400/40"
                        title="Demo done"
                        aria-label="Demo done"
                      >
                        <DemoIcon className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              {comments.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-2 text-xs leading-relaxed text-mist-300"
                    >
                      <AuthorAvatar name={c.author} size="sm" />
                      <span className="line-clamp-2 min-w-0 flex-1">{c.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-mist-600">No comments yet.</p>
              )}
            </button>
            <div className="mt-auto flex items-end justify-between gap-2 pt-3">
              <time
                className="text-[11px] text-mist-500"
                dateTime={lead.createdAt}
              >
                {formatCreated(lead.createdAt)}
              </time>
              <span className="inline-flex items-center gap-1.5">
                {waitingOnUs ? (
                  <button
                    type="button"
                    onClick={() => onCompleteTask?.(lead.id)}
                    disabled={!onCompleteTask}
                    title="Mark task done"
                    aria-label="Mark task done"
                    className="inline-flex items-center rounded-full bg-aurora-400/20 px-2 py-0.5 text-[10px] font-medium text-aurora-200 ring-1 ring-aurora-400/35 hover:bg-aurora-400/30 disabled:opacity-50"
                  >
                    Task
                  </button>
                ) : null}
                {pendingFollowUps > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                    <CalendarIcon className="h-2.5 w-2.5" />
                    {pendingFollowUps === 1
                      ? "Follow-up"
                      : `${pendingFollowUps} follow-ups`}
                  </span>
                ) : null}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

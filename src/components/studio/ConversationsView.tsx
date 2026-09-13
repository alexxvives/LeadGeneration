"use client";

import type { FollowUp, LeadWithOutreach } from "@/lib/types";
import {
  isUserFollowUp,
  resolveFollowUpKind,
  sortFollowUpsNewestFirst,
} from "@/lib/follow-ups";
import { shortLocation } from "@/lib/format-location";
import { CalendarIcon, DemoIcon, PinIcon, StarIcon } from "@/components/icons";
import { EmptyState } from "@/components/studio/StudioHelpers";
import { MarqueeText } from "@/components/studio/MarqueeText";

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function recentComments(followUps: FollowUp[] | undefined): string[] {
  return sortFollowUpsNewestFirst(followUps ?? [])
    .filter((f) => resolveFollowUpKind(f) === "note" && f.note.trim())
    .slice(0, 2)
    .map((f) => f.note.trim());
}

export function ConversationsView({
  leads,
  emptyHref,
  onOpen,
}: {
  leads: LeadWithOutreach[];
  emptyHref: string;
  onOpen: (id: string) => void;
}) {
  const rows = [...leads]
    .filter((l) => (l.crmStage ?? "new") === "in_conversation")
    .sort((a, b) => {
      if (a.waitingOnUs !== b.waitingOnUs) return a.waitingOnUs ? -1 : 1;
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((lead) => {
        const pendingFollowUps =
          lead.followUps?.filter((f) => isUserFollowUp(f) && !f.done).length ?? 0;
        const comments = recentComments(lead.followUps);
        const name = lead.contactName?.trim() || lead.company || "Untitled";
        const cityCountry = shortLocation(lead.location);
        return (
          <article
            key={lead.id}
            className="glass card-hover flex flex-col rounded-xl2 p-5"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onOpen(lead.id)}
                className="min-w-0 flex-1 text-left"
              >
                <h3 className="font-display text-base font-semibold leading-tight">
                  <MarqueeText>{name}</MarqueeText>
                </h3>
                {lead.contactName && lead.company ? (
                  <p className="mt-0.5 text-xs text-mist-400">
                    <MarqueeText>{lead.company}</MarqueeText>
                  </p>
                ) : null}
              </button>
              {(lead.waitingOnUs || lead.demoDone) ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {lead.waitingOnUs ? (
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 shadow-[0_0_12px_rgba(247,185,85,0.35)] ring-1 ring-amber-400/45"
                      title="Waiting on us"
                      aria-label="Waiting on us"
                    >
                      <StarIcon className="h-4 w-4" />
                    </span>
                  ) : null}
                  {lead.demoDone ? (
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-aurora-400/20 text-aurora-300 ring-1 ring-aurora-400/40"
                      title="Demo done"
                      aria-label="Demo done"
                    >
                      <DemoIcon className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpen(lead.id)}
              className="mt-3 min-w-0 flex-1 text-left"
            >
              {cityCountry ? (
                <span className="flex min-w-0 items-center gap-1 text-xs text-mist-400">
                  <PinIcon className="h-3 w-3 shrink-0" />
                  <MarqueeText
                    className="min-w-0 flex-1"
                    title={lead.location ?? cityCountry}
                  >
                    {cityCountry}
                  </MarqueeText>
                </span>
              ) : null}
              {pendingFollowUps > 0 ? (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                  <CalendarIcon className="h-2.5 w-2.5" />
                  {pendingFollowUps === 1
                    ? "Follow-up needed"
                    : `${pendingFollowUps} follow-ups`}
                </p>
              ) : null}
              {comments.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {comments.map((c) => (
                    <li
                      key={c}
                      className="line-clamp-2 text-xs leading-relaxed text-mist-300"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-mist-600">No comments yet.</p>
              )}
            </button>
            <time
              className="mt-auto pt-4 text-[11px] text-mist-500"
              dateTime={lead.createdAt}
            >
              {formatCreated(lead.createdAt)}
            </time>
          </article>
        );
      })}
    </div>
  );
}

"use client";

import type { FollowUp, LeadWithOutreach } from "@/lib/types";
import {
  isUserFollowUp,
  resolveFollowUpKind,
  sortFollowUpsNewestFirst,
} from "@/lib/follow-ups";
import { CalendarIcon, PinIcon, StarIcon } from "@/components/icons";
import { Lockable, useBoardLockUi } from "@/components/studio/board-lock";
import { EmptyState } from "@/components/studio/StudioHelpers";

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
  onUpdate,
}: {
  leads: LeadWithOutreach[];
  emptyHref: string;
  onOpen: (id: string) => void;
  onUpdate: (
    id: string,
    patch: { waitingOnUs?: boolean; demoDone?: boolean },
  ) => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
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
        return (
          <article
            key={lead.id}
            className="glass card-hover flex flex-col rounded-xl2 p-5"
          >
            <button
              type="button"
              onClick={() => onOpen(lead.id)}
              className="min-w-0 text-left"
            >
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 truncate font-display text-base font-semibold leading-tight">
                  <span className="truncate">{name}</span>
                  {lead.waitingOnUs ? (
                    <StarIcon
                      className="h-3.5 w-3.5 shrink-0 text-amber-300"
                      aria-label="Waiting on us"
                    />
                  ) : null}
                </h3>
                {lead.contactName && lead.company ? (
                  <p className="mt-0.5 truncate text-xs text-mist-400">
                    {lead.company}
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mist-400">
                {lead.location ? (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <PinIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{lead.location}</span>
                  </span>
                ) : null}
                <span>Created {formatCreated(lead.createdAt)}</span>
              </div>
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
            <div
              className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              <Lockable>
                <button
                  type="button"
                  disabled={editLocked}
                  title={editLocked ? lockHint : "Toggle waiting on us"}
                  aria-pressed={lead.waitingOnUs}
                  onClick={() =>
                    onUpdate(lead.id, { waitingOnUs: !lead.waitingOnUs })
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset disabled:opacity-60 ${
                    lead.waitingOnUs
                      ? "bg-amber-400/15 text-amber-200 ring-amber-400/30"
                      : "text-mist-400 ring-white/10 hover:text-mist-200"
                  }`}
                >
                  <StarIcon className="h-3 w-3" />
                  Waiting
                </button>
              </Lockable>
            </div>
          </article>
        );
      })}
    </div>
  );
}

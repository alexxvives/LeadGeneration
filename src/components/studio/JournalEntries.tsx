"use client";

import type { FollowUp } from "@/lib/types";
import {
  authorInitials,
  canonicalizeFollowUp,
  followUpAuthorName,
  followUpIsDone,
  formatNoteDate,
  isMissedCallNote,
  resolveFollowUpKind,
  sortFollowUpsNewestFirst,
} from "@/lib/follow-ups";
import { PencilIcon, XIcon } from "@/components/icons";
import { Lockable } from "@/components/studio/board-lock";
import { DatePicker } from "@/components/ui/DatePicker";

export function AuthorAvatar({
  name,
  size = "md",
}: {
  name: string | null | undefined;
  size?: "sm" | "md";
}) {
  const label = name?.trim();
  if (!label) return null;
  const dim = size === "sm" ? "h-5 w-5" : "h-[1.125rem] w-[1.125rem]";
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full bg-mist-100 text-[0px] text-ink-950`}
    >
      {/* Parent text-[0] kills the font strut so two letters sit in the geometric center. */}
      <span className="text-[8px] font-semibold leading-none tracking-normal">
        {authorInitials(label)}
      </span>
    </span>
  );
}

export function JournalEntries({
  followUps,
  editingId,
  editDate,
  editText,
  onEditDate,
  onEditText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onToggleDone,
  disabled,
  lockHint,
}: {
  followUps: FollowUp[];
  editingId: string | null;
  editDate: string;
  editText: string;
  onEditDate: (v: string) => void;
  onEditText: (v: string) => void;
  onStartEdit: (fu: FollowUp) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onToggleDone: (fu: FollowUp) => void;
  disabled: boolean;
  lockHint: string;
}) {
  return (
    <ul className="space-y-2">
      {sortFollowUpsNewestFirst(followUps).map((fu) => {
        const canon = canonicalizeFollowUp(fu);
        const kind = resolveFollowUpKind(canon);
        const isFollow = kind === "follow_up";
        const isTask = kind === "task";
        const missed = isMissedCallNote(canon.note);
        const author = followUpAuthorName(canon);
        const tagClass =
          kind === "email"
            ? "bg-aurora-400/15 text-aurora-200"
            : kind === "phone"
              ? missed
                ? "bg-white/10 text-mist-400"
                : "bg-sky-400/15 text-sky-200"
              : kind === "follow_up"
                ? "bg-violet-400/15 text-violet-200"
                : kind === "task"
                  ? "bg-aurora-400/20 text-aurora-200 ring-1 ring-aurora-400/35"
                  : "bg-amber-400/15 text-amber-200";
        const tagText =
          kind === "email"
            ? "Email"
            : kind === "phone"
              ? missed
                ? "Missed"
                : "Call"
              : kind === "follow_up"
                ? "Follow up"
                : kind === "task"
                  ? "Task"
                  : "Note";
        const lineClass =
          (isFollow || isTask) && followUpIsDone(canon.done)
            ? "text-mist-500 line-through"
            : "";
        const canToggle = isFollow || isTask;
        return (
          <li key={fu.id} className="flex items-start gap-2">
            {canToggle ? (
              <Lockable>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleDone(canon)}
                  aria-pressed={followUpIsDone(canon.done)}
                  title={
                    disabled
                      ? lockHint
                      : followUpIsDone(canon.done)
                        ? "Mark not done"
                        : "Mark done"
                  }
                  className={`mt-0.5 inline-flex w-[5.25rem] shrink-0 justify-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-50 ${tagClass}`}
                >
                  {tagText}
                </button>
              </Lockable>
            ) : (
              <span
                className={`mt-0.5 inline-flex w-[5.25rem] shrink-0 justify-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tagClass}`}
              >
                {tagText}
              </span>
            )}
            {editingId === fu.id ? (
              <div className="min-w-0 flex-1 space-y-2">
                <DatePicker
                  value={editDate}
                  onChange={onEditDate}
                  disabled={disabled}
                />
                <textarea
                  value={editText}
                  onChange={(e) => onEditText(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-sm text-mist-100 outline-none focus:border-aurora-400/60"
                />
                <div className="flex flex-wrap gap-2">
                  <Lockable>
                    <button
                      type="button"
                      onClick={onSaveEdit}
                      disabled={disabled || !editDate}
                      title={disabled ? lockHint : undefined}
                      className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-40"
                    >
                      Save
                    </button>
                  </Lockable>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-500 hover:text-mist-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm leading-relaxed text-mist-300">
                <span className="font-semibold text-mist-100">
                  {formatNoteDate(canon.date)}
                </span>
                <AuthorAvatar name={author} size="sm" />
                {canon.note ? (
                  <span className={lineClass}>{canon.note}</span>
                ) : null}
              </p>
            )}
            {editingId === fu.id ? null : (
              <div className="mt-0.5 flex shrink-0 items-center gap-1">
                <Lockable>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onStartEdit(canon)}
                    className="text-mist-600 hover:text-mist-200 disabled:opacity-50"
                    aria-label={disabled ? lockHint : "Edit note"}
                    title={disabled ? lockHint : "Edit note"}
                  >
                    <PencilIcon className="h-3 w-3" />
                  </button>
                </Lockable>
                <Lockable>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onDelete(fu.id)}
                    className="text-mist-600 hover:text-rose-400 disabled:opacity-50"
                    aria-label={disabled ? lockHint : "Delete note"}
                    title={disabled ? lockHint : "Delete note"}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </Lockable>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

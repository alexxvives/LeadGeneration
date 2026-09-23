"use client";

import { useMemo, useState } from "react";
import type { BoardSummary, Contact } from "@/lib/types";
import {
  canonicalizeFollowUp,
  followUpAuthorName,
  pendingUserFollowUpCount,
  sortFollowUpsNewestFirst,
} from "@/lib/follow-ups";
import { shortLocation } from "@/lib/format-location";
import { MailIcon, PhoneIcon, PinIcon } from "@/components/icons";
import { AuthorAvatar } from "@/components/studio/JournalEntries";
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

export function ContactsView({
  contacts,
  boards,
  filterBoardId,
  onSelect,
}: {
  contacts: Contact[];
  boards: BoardSummary[];
  filterBoardId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const boardName = (id: string) =>
    boards.find((b) => b.id === id)?.name ?? "Board";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    const nameByBoard = new Map(boards.map((b) => [b.id, b.name]));
    return contacts.filter((c) => {
      const blob = [
        c.name,
        c.organization,
        c.email,
        c.phone,
        c.location,
        nameByBoard.get(c.boardId),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [contacts, query, boards]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <p className="text-sm text-mist-400">
          {contacts.length === 0
            ? "No collaborators yet"
            : `${filtered.length} collaborator${filtered.length === 1 ? "" : "s"}${
                query.trim() && filtered.length !== contacts.length
                  ? ` of ${contacts.length}`
                  : ""
              }`}
        </p>
        {contacts.length > 0 ? (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search collaborators…"
            aria-label="Search collaborators"
            className="ml-auto w-full min-w-0 max-w-xs rounded-full border border-white/10 bg-ink-900/60 px-4 py-2 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60 sm:w-56"
          />
        ) : null}
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          title="No collaborators yet"
          body="Track partners, referrers, and team contacts — notes and follow-ups sync to Calendar."
          showAction={false}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-white/10 px-6 py-12 text-center">
          <p className="text-sm text-mist-300">
            No matches for &ldquo;{query.trim()}&rdquo;
          </p>
        </div>
      ) : (
        <div className="grid auto-rows-fr items-stretch content-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => {
            const pending = pendingUserFollowUpCount(c.followUps);
            const latestRaw = sortFollowUpsNewestFirst(c.followUps ?? []).find(
              (f) => f.note.trim(),
            );
            const latest = latestRaw ? canonicalizeFollowUp(latestRaw) : null;
            const cityCountry = shortLocation(c.location);
            return (
              <article
                key={c.id}
                className="glass card-hover flex h-full w-full flex-col overflow-hidden rounded-xl2 p-4 text-left"
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex h-full w-full flex-col items-stretch text-left"
                >
                  <div className="w-full min-w-0">
                    <h3 className="truncate font-display text-base font-semibold leading-tight">
                      {c.name}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-mist-400">
                      {c.organization || "\u00a0"}
                    </p>
                  </div>
                  <div className="mt-3 min-h-[3.75rem] w-full space-y-1 text-xs text-mist-500">
                    {c.email ? (
                      <p className="flex items-center gap-1.5 truncate">
                        <MailIcon className="h-3 w-3 shrink-0 text-mist-600" />
                        {c.email}
                      </p>
                    ) : null}
                    {c.phone ? (
                      <p className="flex items-center gap-1.5 truncate">
                        <PhoneIcon className="h-3 w-3 shrink-0 text-mist-600" />
                        {c.phone}
                      </p>
                    ) : null}
                    {cityCountry ? (
                      <p className="flex items-center gap-1.5 truncate">
                        <PinIcon className="h-3 w-3 shrink-0 text-mist-600" />
                        {cityCountry}
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-2 flex min-h-[2.5rem] items-start gap-2 text-xs leading-relaxed text-mist-300">
                    {latest ? (
                      <>
                        <AuthorAvatar
                          name={followUpAuthorName(latest)}
                          size="sm"
                        />
                        <span className="line-clamp-2 min-w-0 flex-1">
                          {latest.note}
                        </span>
                      </>
                    ) : (
                      <span className="min-w-0 flex-1">&nbsp;</span>
                    )}
                  </p>
                  <div className="mt-auto flex w-full flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[11px] text-mist-600">
                    <span>{formatCreated(c.createdAt)}</span>
                    {!filterBoardId || filterBoardId === "all" ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{boardName(c.boardId)}</span>
                      </>
                    ) : null}
                    {pending > 0 ? (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-violet-400/15 px-1.5 py-0.5 font-medium text-violet-200">
                        {pending === 1 ? "Follow-up" : `${pending} follow-ups`}
                      </span>
                    ) : null}
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

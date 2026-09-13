"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardSummary, Contact } from "@/lib/types";
import {
  isUserFollowUp,
  sortFollowUpsNewestFirst,
} from "@/lib/follow-ups";
import { MailIcon, PhoneIcon, PinIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";

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
  onCreate,
  createRequestId = 0,
}: {
  contacts: Contact[];
  boards: BoardSummary[];
  filterBoardId: string | null;
  onSelect: (id: string) => void;
  createRequestId?: number;
  onCreate: (input: {
    boardId: string;
    name: string;
    organization?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
  }) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    name: "",
    organization: "",
    email: "",
    phone: "",
    location: "",
    boardId: filterBoardId && filterBoardId !== "all" ? filterBoardId : "",
  });

  const boardName = (id: string) =>
    boards.find((b) => b.id === id)?.name ?? "Board";

  const defaultBoardId =
    filterBoardId && filterBoardId !== "all"
      ? filterBoardId
      : (boards[0]?.id ?? "");

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

  const openCreate = () => {
    setForm({
      name: "",
      organization: "",
      email: "",
      phone: "",
      location: "",
      boardId: defaultBoardId,
    });
    setCreating(true);
  };

  useEffect(() => {
    if (createRequestId > 0) openCreate();
    // Parent increments to open the same create form the header button uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request id is the trigger
  }, [createRequestId]);

  const submitCreate = async () => {
    const name = form.name.trim();
    const boardId = form.boardId || defaultBoardId;
    if (!name || !boardId || saving) return;
    setSaving(true);
    try {
      await onCreate({
        boardId,
        name,
        organization: form.organization.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        location: form.location.trim() || null,
      });
      setCreating(false);
    } finally {
      setSaving(false);
    }
  };

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

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New collaborator"
        className="max-w-lg"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Name"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            required
          />
          <Field
            label="Organization"
            value={form.organization}
            onChange={(v) => setForm((f) => ({ ...f, organization: v }))}
          />
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          />
          <Field
            label="Location"
            value={form.location}
            onChange={(v) => setForm((f) => ({ ...f, location: v }))}
          />
          {(!filterBoardId || filterBoardId === "all") && boards.length > 1 ? (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-mist-500">
                Board
              </span>
              <select
                value={form.boardId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, boardId: e.target.value }))
                }
                className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none focus:border-aurora-400/60"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="rounded-full px-4 py-2 text-sm text-mist-300 hover:text-mist-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !form.name.trim() || !form.boardId}
            onClick={() => void submitCreate()}
            className="rounded-full bg-aurora-400 px-5 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>

      {contacts.length === 0 ? (
        <div className="glass rounded-xl2 px-6 py-16 text-center">
          <p className="font-display text-xl font-semibold">No collaborators yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-mist-400">
            Track partners, referrers, and team contacts — notes and follow-ups
            sync to Calendar.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-xl2 px-6 py-12 text-center">
          <p className="text-sm text-mist-400">No matches for &ldquo;{query.trim()}&rdquo;</p>
        </div>
      ) : (
        <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => {
            const pending =
              c.followUps?.filter((f) => isUserFollowUp(f) && !f.done)
                .length ?? 0;
            const latest = sortFollowUpsNewestFirst(c.followUps ?? []).find(
              (f) => f.note.trim(),
            );
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className="glass card-hover rounded-xl2 p-4 text-left transition-transform"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold">
                    {c.name}
                  </h3>
                  {c.organization ? (
                    <p className="mt-0.5 truncate text-xs text-mist-400">
                      {c.organization}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 space-y-1 text-xs text-mist-500">
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
                  {c.location ? (
                    <p className="flex items-center gap-1.5 truncate">
                      <PinIcon className="h-3 w-3 shrink-0 text-mist-600" />
                      {c.location}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-mist-600">
                  <span>{formatCreated(c.createdAt)}</span>
                  {(!filterBoardId || filterBoardId === "all") ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{boardName(c.boardId)}</span>
                    </>
                  ) : null}
                  {pending > 0 ? (
                    <span className="rounded-full bg-violet-400/15 px-1.5 py-0.5 font-medium text-violet-200">
                      {pending === 1 ? "Follow-up" : `${pending} follow-ups`}
                    </span>
                  ) : null}
                </div>
                {latest ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-mist-300">
                    {latest.note}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-mist-500">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
      />
    </label>
  );
}

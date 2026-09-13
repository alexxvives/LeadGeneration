"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardSummary, Contact, FollowUp } from "@/lib/types";
import { newId } from "@/lib/id";
import {
  addDaysIso,
  formatNoteDate,
  isUserFollowUp,
  resolveFollowUpKind,
  sortFollowUpsNewestFirst,
  todayIsoDate,
} from "@/lib/follow-ups";
import { PinIcon, TrashIcon, XIcon } from "@/components/icons";
import { Lockable, useBoardLockUi } from "@/components/studio/board-lock";
import { DatePicker } from "@/components/ui/DatePicker";

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
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  createRequestId = 0,
}: {
  contacts: Contact[];
  boards: BoardSummary[];
  filterBoardId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  createRequestId?: number;
  onCreate: (input: {
    boardId: string;
    name: string;
    organization?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    patch: {
      name?: string;
      organization?: string | null;
      email?: string | null;
      phone?: string | null;
      location?: string | null;
      followUps?: FollowUp[];
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const defaultBoardId =
    filterBoardId && filterBoardId !== "all"
      ? filterBoardId
      : (boards[0]?.id ?? "");

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
      {contacts.length > 0 ? (
        <p className="shrink-0 text-sm text-mist-400">
          {contacts.length} collaborator{contacts.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {creating ? (
        <div className="glass rounded-xl2 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">New collaborator</h3>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-full p-1 text-mist-400 hover:text-mist-100"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
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
              <label className="block">
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
          <div className="mt-4 flex justify-end gap-2">
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
        </div>
      ) : null}

      {contacts.length === 0 && !creating ? (
        <div className="glass rounded-xl2 px-6 py-12 text-center">
          <p className="font-display text-xl font-semibold">No collaborators yet</p>
        </div>
      ) : (
        <div
          className={`grid min-h-0 flex-1 gap-4 ${
            selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]" : ""
          }`}
        >
          <div
            className={`grid content-start gap-3 sm:grid-cols-2 ${
              selected ? "hidden lg:grid" : ""
            }`}
          >
            {contacts.map((c) => {
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
                  className={`glass card-hover rounded-xl2 p-4 text-left ${
                    selectedId === c.id
                      ? "ring-1 ring-aurora-400/40"
                      : ""
                  }`}
                >
                  <h3 className="truncate font-display text-base font-semibold">
                    {c.name}
                  </h3>
                  {c.organization ? (
                    <p className="mt-0.5 truncate text-xs text-mist-400">
                      {c.organization}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mist-500">
                    {c.location ? (
                      <span className="inline-flex items-center gap-1">
                        <PinIcon className="h-3 w-3" />
                        {c.location}
                      </span>
                    ) : null}
                    <span>{formatCreated(c.createdAt)}</span>
                    {(!filterBoardId || filterBoardId === "all") ? (
                      <span>{boardName(c.boardId)}</span>
                    ) : null}
                  </div>
                  {pending > 0 ? (
                    <p className="mt-2 text-[10px] font-medium text-violet-300">
                      {pending === 1 ? "Follow-up needed" : `${pending} follow-ups`}
                    </p>
                  ) : null}
                  {latest ? (
                    <p className="mt-2 line-clamp-2 text-xs text-mist-300">
                      {latest.note}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
          {selected ? (
            <div className="flex min-h-0 min-w-0 flex-col">
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="mb-3 inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-white/10 px-3 text-sm text-mist-300 transition-colors hover:border-white/20 hover:text-mist-100 lg:hidden"
              >
                ← Back to collaborators
              </button>
              <ContactPanel
                contact={selected}
                boardName={boardName(selected.boardId)}
                disabled={editLocked}
                lockHint={lockHint}
                onClose={() => onSelect(null)}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            </div>
          ) : null}
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

function ContactPanel({
  contact,
  boardName,
  disabled,
  lockHint,
  onClose,
  onUpdate,
  onDelete,
}: {
  contact: Contact;
  boardName: string;
  disabled: boolean;
  lockHint: string;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: {
      name?: string;
      organization?: string | null;
      email?: string | null;
      phone?: string | null;
      location?: string | null;
      followUps?: FollowUp[];
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [composer, setComposer] = useState<"note" | "follow_up" | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(todayIsoDate());
  const followUps = useMemo(
    () => sortFollowUpsNewestFirst(contact.followUps ?? []),
    [contact.followUps],
  );

  const addEntry = async (kind: "note" | "follow_up") => {
    const text = noteText.trim() || (kind === "follow_up" ? "Follow up" : "");
    if (!text) return;
    const fu: FollowUp = {
      id: newId("fu"),
      date: noteDate || todayIsoDate(),
      note: text,
      done: kind === "note",
      kind,
    };
    await onUpdate(contact.id, { followUps: [fu, ...(contact.followUps ?? [])] });
    setComposer(null);
    setNoteText("");
    setNoteDate(todayIsoDate());
  };

  return (
    <aside className="glass flex min-h-0 flex-col rounded-xl2 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold">
            {contact.name}
          </h3>
          <p className="text-xs text-mist-500">{boardName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-mist-400 hover:text-mist-100"
          aria-label="Close"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-1 text-sm text-mist-300">
        {contact.organization ? <p>{contact.organization}</p> : null}
        {contact.email ? <p>{contact.email}</p> : null}
        {contact.phone ? <p>{contact.phone}</p> : null}
        {contact.location ? <p>{contact.location}</p> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Lockable>
          <button
            type="button"
            disabled={disabled}
            title={disabled ? lockHint : "Add note"}
            onClick={() => {
              setComposer("note");
              setNoteDate(todayIsoDate());
              setNoteText("");
            }}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-200 hover:bg-white/5 disabled:opacity-50"
          >
            Add note
          </button>
        </Lockable>
        <Lockable>
          <button
            type="button"
            disabled={disabled}
            title={disabled ? lockHint : "Schedule follow-up"}
            onClick={() => {
              setComposer("follow_up");
              setNoteDate(addDaysIso(7));
              setNoteText("Follow up");
            }}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-200 hover:bg-white/5 disabled:opacity-50"
          >
            Follow up
          </button>
        </Lockable>
        <Lockable>
          <button
            type="button"
            disabled={disabled}
            title={disabled ? lockHint : "Delete collaborator"}
            onClick={() => void onDelete(contact.id)}
            className="ml-auto rounded-full p-1.5 text-mist-500 hover:text-rose-300 disabled:opacity-50"
            aria-label="Delete collaborator"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </Lockable>
      </div>

      {composer ? (
        <div className="mt-3 space-y-2">
          <DatePicker
            value={noteDate}
            onChange={setNoteDate}
            disabled={disabled}
          />
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-mist-100 outline-none"
            placeholder={composer === "follow_up" ? "Follow up" : "Note"}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setComposer(null)}
              className="text-xs text-mist-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void addEntry(composer)}
              className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-on-accent"
            >
              Save
            </button>
          </div>
        </div>
      ) : null}

      <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {followUps.length === 0 ? (
          <li className="text-xs text-mist-600">No notes yet.</li>
        ) : (
          followUps.map((fu) => {
            const kind = resolveFollowUpKind(fu);
            return (
              <li
                key={fu.id}
                className="rounded-xl border border-white/5 bg-ink-950/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      kind === "follow_up"
                        ? "bg-violet-400/15 text-violet-200"
                        : "bg-amber-400/15 text-amber-200"
                    }`}
                  >
                    {kind === "follow_up" ? "Follow up" : "Note"}
                  </span>
                  <span className="text-[11px] text-mist-500">
                    {formatNoteDate(fu.date)}
                  </span>
                </div>
                <p
                  className={`mt-1 text-xs leading-relaxed ${
                    fu.done && kind === "follow_up"
                      ? "text-mist-500 line-through"
                      : "text-mist-200"
                  }`}
                >
                  {fu.note}
                </p>
                {kind === "follow_up" ? (
                  <Lockable>
                    <button
                      type="button"
                      disabled={disabled}
                      title={disabled ? lockHint : undefined}
                      onClick={() => {
                        const next = (contact.followUps ?? []).map((f) =>
                          f.id === fu.id ? { ...f, done: !f.done } : f,
                        );
                        void onUpdate(contact.id, { followUps: next });
                      }}
                      className="mt-1 text-[11px] text-aurora-300 hover:text-aurora-200 disabled:opacity-50"
                    >
                      {fu.done ? "Mark not done" : "Mark done"}
                    </button>
                  </Lockable>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}

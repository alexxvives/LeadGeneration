"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardSummary, Contact, FollowUp } from "@/lib/types";
import { newId } from "@/lib/id";
import {
  addDaysIso,
  authorInitials,
  followUpIsDone,
  pendingUserFollowUpCount,
  sortFollowUpsNewestFirst,
  todayIsoDate,
  withFollowUpAuthor,
} from "@/lib/follow-ups";
import { parseRecipientEmail } from "@/lib/email/address";
import {
  BuildingIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { Lockable, useBoardLockUi } from "@/components/studio/board-lock";
import { DatePicker } from "@/components/ui/DatePicker";
import { JournalEntries } from "@/components/studio/JournalEntries";

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function EditableInfoRow({
  icon,
  label,
  defaultValue,
  fieldKey,
  placeholder,
  onSave,
  onLiveChange,
  disabled = false,
  lockHint,
}: {
  icon: React.ReactNode;
  label: string;
  defaultValue: string;
  fieldKey: string;
  placeholder: string;
  onSave: (raw: string) => void;
  onLiveChange?: (raw: string) => void;
  disabled?: boolean;
  lockHint?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm text-mist-100">
      <span className="shrink-0 text-mist-500" aria-hidden>
        {icon}
      </span>
      <Lockable className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/10 bg-ink-950/40 px-2.5 py-1.5 focus-within:border-aurora-400/50">
          <input
            key={fieldKey}
            defaultValue={defaultValue}
            onChange={(e) => onLiveChange?.(e.target.value)}
            onBlur={(e) => {
              if (disabled) return;
              onSave(e.target.value);
            }}
            placeholder={placeholder}
            aria-label={disabled && lockHint ? lockHint : label}
            disabled={disabled}
            title={disabled ? lockHint : undefined}
            className="min-w-0 flex-1 bg-transparent text-sm text-mist-100 outline-none placeholder:text-mist-500 disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>
      </Lockable>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-mist-500">
      {children}
    </h4>
  );
}

export function ContactDrawer({
  contact,
  boardName,
  boards = [],
  filterBoardId = null,
  actorName,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  contact: Contact | null;
  boardName: string;
  boards?: BoardSummary[];
  filterBoardId?: string | null;
  actorName?: string | null;
  onClose: () => void;
  onCreate?: (input: {
    boardId: string;
    name: string;
    organization?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
  }) => Promise<Contact>;
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
  const panelRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const creating = !contact;
  const defaultBoardId =
    filterBoardId && filterBoardId !== "all"
      ? filterBoardId
      : (boards[0]?.id ?? "");
  const [draft, setDraft] = useState({
    name: "",
    organization: "",
    email: "",
    phone: "",
    location: "",
    boardId: defaultBoardId,
  });
  const [saving, setSaving] = useState(false);
  const createdRef = useRef<Contact | null>(null);
  const persistInFlight = useRef<Promise<Contact | null> | null>(null);
  const draftRef = useRef(draft);
  const skipFocusRef = useRef(false);
  draftRef.current = draft;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [composer, setComposer] = useState<"note" | "follow_up" | "task" | null>(
    null,
  );
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(todayIsoDate());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(todayIsoDate());
  const [editText, setEditText] = useState("");

  useEffect(() => {
    if (!creating) return;
    const next =
      (filterBoardId && filterBoardId !== "all" ? filterBoardId : "") ||
      defaultBoardId ||
      boards[0]?.id ||
      "";
    if (!next) return;
    setDraft((d) => (d.boardId ? d : { ...d, boardId: next }));
  }, [creating, filterBoardId, defaultBoardId, boards]);

  const followUps = useMemo(
    () => sortFollowUpsNewestFirst(contact?.followUps ?? []),
    [contact?.followUps],
  );
  const pending = pendingUserFollowUpCount(contact?.followUps);
  const showBoardPicker =
    creating && (!filterBoardId || filterBoardId === "all") && boards.length > 1;
  const displayName = contact?.name || draft.name;
  const notesLocked = editLocked || creating;

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    nameInputRef.current?.focus();
    return () => {
      prevFocus.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!contact) return;
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    nameInputRef.current?.focus();
    // Re-focus when switching records — not on follow-up / profile patches.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id is the switch signal
  }, [contact?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // requestClose is stable enough for dismiss; recreate would rebind every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, creating, draft, saving, contact]);

  const persistCreate = async (): Promise<Contact | null> => {
    if (createdRef.current) return createdRef.current;
    if (!creating || !onCreate) return contact;
    if (persistInFlight.current) return persistInFlight.current;
    const name = (nameInputRef.current?.value ?? draftRef.current.name).trim();
    const boardId =
      draftRef.current.boardId ||
      (filterBoardId && filterBoardId !== "all" ? filterBoardId : "") ||
      defaultBoardId ||
      boards[0]?.id ||
      "";
    if (!name) {
      setNameInvalid(true);
      return null;
    }
    if (!boardId) return null;
    setSaving(true);
    const snapshot = draftRef.current;
    const run = (async () => {
      try {
        const saved = await onCreate({
          boardId,
          name,
          organization: snapshot.organization.trim() || null,
          email: parseRecipientEmail(snapshot.email.trim()) ?? null,
          phone: snapshot.phone.trim() || null,
          location: snapshot.location.trim() || null,
        });
        createdRef.current = saved;
        skipFocusRef.current = true;
        return saved;
      } finally {
        persistInFlight.current = null;
        setSaving(false);
      }
    })();
    persistInFlight.current = run;
    return run;
  };

  const requestClose = async () => {
    if (creating && !editLocked) {
      const name = (nameInputRef.current?.value ?? draftRef.current.name).trim();
      if (name) {
        try {
          const saved = await persistCreate();
          if (!saved) {
            onClose();
            return;
          }
        } catch {
          onClose();
          return;
        }
      }
    }
    onClose();
  };

  const addEntry = async (kind: "note" | "follow_up" | "task") => {
    if (!contact || editLocked) return;
    const text =
      noteText.trim() ||
      (kind === "follow_up" ? "Follow up" : kind === "task" ? "" : "");
    if (!text) return;
    const fu = withFollowUpAuthor(
      {
        id: newId("fu"),
        date: noteDate || todayIsoDate(),
        note: text,
        done: kind === "note",
        kind,
      },
      actorName,
    );
    await onUpdate(contact.id, { followUps: [fu, ...(contact.followUps ?? [])] });
    setComposer(null);
    setNoteText("");
    setNoteDate(todayIsoDate());
  };

  const saveField = (
    field: "organization" | "email" | "phone" | "location",
    raw: string,
  ) => {
    let next: string | null = raw.trim() || null;
    if (field === "email") {
      next = next ? parseRecipientEmail(next) : null;
    }
    if (creating) {
      setDraft((d) => ({ ...d, [field]: next ?? "" }));
      return;
    }
    if (!contact) return;
    const cur = contact[field]?.trim() || null;
    if (next !== cur) {
      void onUpdate(contact.id, { [field]: next });
    }
  };

  const deleteFollowUp = async (fuId: string) => {
    if (!contact || editLocked) return;
    const updated = (contact.followUps ?? []).filter((f) => f.id !== fuId);
    if (editingId === fuId) setEditingId(null);
    await onUpdate(contact.id, { followUps: updated });
  };

  const toggleFollowUpDone = async (fu: FollowUp) => {
    if (!contact || editLocked) return;
    const updated = (contact.followUps ?? []).map((f) =>
      f.id === fu.id ? { ...f, done: !followUpIsDone(f.done) } : f,
    );
    await onUpdate(contact.id, { followUps: updated });
  };

  const startEditFollowUp = (fu: FollowUp) => {
    if (editLocked) return;
    setEditingId(fu.id);
    setEditDate(fu.date);
    setEditText(fu.note);
  };

  const saveEditFollowUp = async () => {
    if (!contact || editLocked || !editingId || !editDate) return;
    const updated = (contact.followUps ?? []).map((f) =>
      f.id === editingId ? { ...f, date: editDate, note: editText.trim() } : f,
    );
    setEditingId(null);
    await onUpdate(contact.id, { followUps: updated });
  };

  const openComposer = (kind: "note" | "follow_up" | "task") => {
    if (notesLocked) return;
    setComposer(kind);
    if (kind === "follow_up") {
      setNoteDate(addDaysIso(7));
      setNoteText("Follow up");
    } else if (kind === "task") {
      setNoteDate(todayIsoDate());
      setNoteText("");
    } else {
      setNoteDate(todayIsoDate());
      setNoteText("");
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-stretch justify-center p-0 md:items-center md:p-4 lg:p-6">
      <div
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={() => void requestClose()}
        aria-hidden
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-drawer-title"
        className="relative flex w-full max-w-[42rem] flex-col overflow-hidden border-white/10 bg-ink-900 shadow-2xl max-md:h-dvh max-md:border-0 md:max-h-[min(90dvh,720px)] md:animate-float-up md:rounded-xl2 md:border"
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/5 bg-ink-900/90 p-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl md:p-6 md:pt-6">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-aurora-400/15 text-sm font-semibold text-aurora-200 ring-1 ring-aurora-400/30"
              aria-hidden
            >
              {authorInitials(displayName || "?")}
            </div>
            <div className="min-w-0 flex-1">
              <Lockable className="block min-w-0">
                <input
                  id="contact-drawer-title"
                  ref={nameInputRef}
                  key={contact ? `${contact.id}-name-${contact.name}` : "new-name"}
                  defaultValue={contact?.name ?? ""}
                  placeholder="Name"
                  disabled={editLocked || saving}
                  title={editLocked ? lockHint : undefined}
                  aria-invalid={nameInvalid}
                  aria-required
                  onChange={(e) => {
                    const v = e.target.value;
                    if (creating) setDraft((d) => ({ ...d, name: v }));
                    if (nameInvalid && v.trim()) setNameInvalid(false);
                  }}
                  onBlur={(e) => {
                    if (editLocked || saving) return;
                    const next = e.target.value.trim();
                    if (!next) {
                      setNameInvalid(true);
                      if (contact) e.target.value = contact.name;
                      return;
                    }
                    if (creating) {
                      setDraft((d) => ({ ...d, name: next }));
                      void persistCreate();
                      return;
                    }
                    if (contact && next !== contact.name) {
                      void onUpdate(contact.id, { name: next });
                    }
                  }}
                  className="w-full truncate bg-transparent font-display text-xl font-semibold text-mist-100 outline-none placeholder:text-mist-500 disabled:opacity-70 md:text-2xl"
                />
              </Lockable>
              <p className="mt-1 text-xs text-mist-500">
                {creating
                  ? showBoardPicker
                    ? "New collaborator"
                    : boardName || "New collaborator"
                  : boardName}
                {contact ? (
                  <>
                    <span className="mx-1.5 text-mist-700">·</span>
                    Added {formatCreated(contact.createdAt)}
                  </>
                ) : null}
                {pending > 0 ? (
                  <>
                    <span className="mx-1.5 text-mist-700">·</span>
                    <span className="text-violet-300">
                      {pending === 1 ? "1 follow-up" : `${pending} follow-ups`}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {creating ? null : confirmDelete && !editLocked && contact ? (
              <div className="mr-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void onDelete(contact.id)}
                  className="rounded-full bg-rose-400 px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-rose-300"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full px-2 py-1.5 text-xs text-mist-400 hover:text-mist-100"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Lockable>
                <button
                  type="button"
                  disabled={editLocked}
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg p-2 text-mist-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-50"
                  aria-label={
                    editLocked ? lockHint : `Delete ${contact?.name ?? ""}`
                  }
                  title={editLocked ? lockHint : "Delete collaborator"}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </Lockable>
            )}
            <button
              type="button"
              onClick={() => void requestClose()}
              className="rounded-lg p-2 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-200"
              aria-label="Close"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <section className="grid gap-2.5">
            <SectionLabel>Profile</SectionLabel>
            {showBoardPicker ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-mist-500">
                  Board
                </span>
                <select
                  value={draft.boardId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, boardId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-ink-950/40 px-2.5 py-1.5 text-sm text-mist-100 outline-none focus:border-aurora-400/50"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <EditableInfoRow
              icon={<BuildingIcon className="h-4 w-4" />}
              label="Organization"
              defaultValue={
                creating ? draft.organization : (contact?.organization ?? "")
              }
              fieldKey={
                contact
                  ? `${contact.id}-org-${contact.organization ?? ""}`
                  : "new-org"
              }
              placeholder="Organization or role"
              disabled={editLocked || saving}
              lockHint={lockHint}
              onLiveChange={
                creating
                  ? (raw) =>
                      setDraft((d) => ({ ...d, organization: raw }))
                  : undefined
              }
              onSave={(raw) => saveField("organization", raw)}
            />
            <EditableInfoRow
              icon={<MailIcon className="h-4 w-4" />}
              label="Email"
              defaultValue={creating ? draft.email : (contact?.email ?? "")}
              fieldKey={
                contact
                  ? `${contact.id}-email-${contact.email ?? ""}`
                  : "new-email"
              }
              placeholder="name@company.com"
              disabled={editLocked || saving}
              lockHint={lockHint}
              onLiveChange={
                creating
                  ? (raw) => setDraft((d) => ({ ...d, email: raw }))
                  : undefined
              }
              onSave={(raw) => saveField("email", raw)}
            />
            <EditableInfoRow
              icon={<PhoneIcon className="h-4 w-4" />}
              label="Phone"
              defaultValue={creating ? draft.phone : (contact?.phone ?? "")}
              fieldKey={
                contact
                  ? `${contact.id}-phone-${contact.phone ?? ""}`
                  : "new-phone"
              }
              placeholder="Phone number"
              disabled={editLocked || saving}
              lockHint={lockHint}
              onLiveChange={
                creating
                  ? (raw) => setDraft((d) => ({ ...d, phone: raw }))
                  : undefined
              }
              onSave={(raw) => saveField("phone", raw)}
            />
            <EditableInfoRow
              icon={<PinIcon className="h-4 w-4" />}
              label="Location"
              defaultValue={
                creating ? draft.location : (contact?.location ?? "")
              }
              fieldKey={
                contact
                  ? `${contact.id}-loc-${contact.location ?? ""}`
                  : "new-loc"
              }
              placeholder="City or region"
              disabled={editLocked || saving}
              lockHint={lockHint}
              onLiveChange={
                creating
                  ? (raw) => setDraft((d) => ({ ...d, location: raw }))
                  : undefined
              }
              onSave={(raw) => saveField("location", raw)}
            />
          </section>

          <section className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Notes</SectionLabel>
              <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
                <Lockable>
                  <button
                    type="button"
                    disabled={notesLocked}
                    title={
                      creating
                        ? "Add a name to save this collaborator first"
                        : editLocked
                          ? lockHint
                          : undefined
                    }
                    onClick={() => openComposer("note")}
                    className="text-[11px] text-amber-300 hover:underline disabled:opacity-50"
                  >
                    Add Note
                  </button>
                </Lockable>
                <Lockable>
                  <button
                    type="button"
                    disabled={notesLocked}
                    title={
                      creating
                        ? "Add a name to save this collaborator first"
                        : editLocked
                          ? lockHint
                          : undefined
                    }
                    onClick={() => openComposer("follow_up")}
                    className="text-[11px] text-violet-300 hover:underline disabled:opacity-50"
                  >
                    Follow up
                  </button>
                </Lockable>
                <Lockable>
                  <button
                    type="button"
                    disabled={notesLocked}
                    title={
                      creating
                        ? "Add a name to save this collaborator first"
                        : editLocked
                          ? lockHint
                          : undefined
                    }
                    onClick={() => openComposer("task")}
                    className="text-[11px] text-aurora-300 hover:underline disabled:opacity-50"
                  >
                    Add Task
                  </button>
                </Lockable>
              </div>
            </div>

            {composer ? (
              <div
                className={`mb-4 space-y-2 rounded-xl border p-3 ${
                  composer === "task"
                    ? "border-aurora-400/35 bg-aurora-400/10"
                    : "border-white/10 bg-ink-900/60"
                }`}
              >
                {composer === "task" ? (
                  <p className="text-xs font-medium text-aurora-200">
                    What they expect from us
                  </p>
                ) : null}
                <DatePicker
                  label={
                    composer === "follow_up"
                      ? "Follow up on"
                      : composer === "task"
                        ? "Due"
                        : "Date"
                  }
                  value={noteDate}
                  onChange={setNoteDate}
                  disabled={editLocked}
                />
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  disabled={editLocked}
                  className="w-full resize-y rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-sm text-mist-100 outline-none placeholder:text-mist-600 focus:border-aurora-400/60 disabled:opacity-50"
                  placeholder={
                    composer === "follow_up"
                      ? "Follow up"
                      : composer === "task"
                        ? "Proposal, callback, pricing…"
                        : "What happened…"
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Lockable>
                    <button
                      type="button"
                      disabled={
                        editLocked ||
                        ((composer === "note" || composer === "task") &&
                          !noteText.trim())
                      }
                      onClick={() => void addEntry(composer)}
                      title={editLocked ? lockHint : undefined}
                      className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-40"
                    >
                      Save
                    </button>
                  </Lockable>
                  <button
                    type="button"
                    onClick={() => setComposer(null)}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-500 hover:text-mist-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {creating && !composer ? (
              <p className="text-xs text-mist-600">
                Add a name to save, then notes and tasks live here.
              </p>
            ) : followUps.length === 0 && !composer ? (
              <p className="text-xs text-mist-600">No notes yet.</p>
            ) : followUps.length > 0 ? (
              <JournalEntries
                followUps={followUps}
                editingId={editingId}
                editDate={editDate}
                editText={editText}
                onEditDate={setEditDate}
                onEditText={setEditText}
                onStartEdit={startEditFollowUp}
                onSaveEdit={() => void saveEditFollowUp()}
                onCancelEdit={() => setEditingId(null)}
                onDelete={(id) => void deleteFollowUp(id)}
                onToggleDone={(fu) => void toggleFollowUpDone(fu)}
                disabled={editLocked}
                lockHint={lockHint}
              />
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}

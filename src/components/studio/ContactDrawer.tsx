"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Contact, FollowUp } from "@/lib/types";
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
  disabled = false,
  lockHint,
}: {
  icon: React.ReactNode;
  label: string;
  defaultValue: string;
  fieldKey: string;
  placeholder: string;
  onSave: (raw: string) => void;
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
  actorName,
  onClose,
  onUpdate,
  onDelete,
}: {
  contact: Contact;
  boardName: string;
  actorName?: string | null;
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
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const panelRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [composer, setComposer] = useState<"note" | "follow_up" | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(todayIsoDate());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(todayIsoDate());
  const [editText, setEditText] = useState("");

  const followUps = useMemo(
    () => sortFollowUpsNewestFirst(contact.followUps ?? []),
    [contact.followUps],
  );
  const pending = pendingUserFollowUpCount(contact.followUps);

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    nameInputRef.current?.focus();
    return () => {
      prevFocus.current?.focus?.();
    };
  }, [contact.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addEntry = async (kind: "note" | "follow_up") => {
    const text = noteText.trim() || (kind === "follow_up" ? "Follow up" : "");
    if (!text || editLocked) return;
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
    const cur = contact[field]?.trim() || null;
    if (next !== cur) {
      void onUpdate(contact.id, { [field]: next });
    }
  };

  const deleteFollowUp = async (fuId: string) => {
    if (editLocked) return;
    const updated = (contact.followUps ?? []).filter((f) => f.id !== fuId);
    if (editingId === fuId) setEditingId(null);
    await onUpdate(contact.id, { followUps: updated });
  };

  const toggleFollowUpDone = async (fu: FollowUp) => {
    if (editLocked) return;
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
    if (editLocked || !editingId || !editDate) return;
    const updated = (contact.followUps ?? []).map((f) =>
      f.id === editingId ? { ...f, date: editDate, note: editText.trim() } : f,
    );
    setEditingId(null);
    await onUpdate(contact.id, { followUps: updated });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-stretch justify-center p-0 md:items-center md:p-4 lg:p-6">
      <div
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={onClose}
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
              {authorInitials(contact.name)}
            </div>
            <div className="min-w-0 flex-1">
              <Lockable className="block min-w-0">
                <input
                  id="contact-drawer-title"
                  ref={nameInputRef}
                  key={`${contact.id}-name-${contact.name}`}
                  defaultValue={contact.name}
                  placeholder="Name"
                  disabled={editLocked}
                  title={editLocked ? lockHint : undefined}
                  aria-invalid={nameInvalid}
                  aria-required
                  onChange={(e) => {
                    if (nameInvalid && e.target.value.trim()) {
                      setNameInvalid(false);
                    }
                  }}
                  onBlur={(e) => {
                    if (editLocked) return;
                    const next = e.target.value.trim();
                    if (!next) {
                      setNameInvalid(true);
                      e.target.value = contact.name;
                      return;
                    }
                    if (next !== contact.name) {
                      void onUpdate(contact.id, { name: next });
                    }
                  }}
                  className="w-full truncate bg-transparent font-display text-xl font-semibold text-mist-100 outline-none placeholder:text-mist-500 disabled:opacity-70 md:text-2xl"
                />
              </Lockable>
              <p className="mt-1 text-xs text-mist-500">
                {boardName}
                <span className="mx-1.5 text-mist-700">·</span>
                Added {formatCreated(contact.createdAt)}
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
            {confirmDelete && !editLocked ? (
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
                  aria-label={editLocked ? lockHint : `Delete ${contact.name}`}
                  title={editLocked ? lockHint : "Delete collaborator"}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </Lockable>
            )}
            <button
              type="button"
              onClick={onClose}
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
            <EditableInfoRow
              icon={<BuildingIcon className="h-4 w-4" />}
              label="Organization"
              defaultValue={contact.organization ?? ""}
              fieldKey={`${contact.id}-org-${contact.organization ?? ""}`}
              placeholder="Organization or role"
              disabled={editLocked}
              lockHint={lockHint}
              onSave={(raw) => saveField("organization", raw)}
            />
            <EditableInfoRow
              icon={<MailIcon className="h-4 w-4" />}
              label="Email"
              defaultValue={contact.email ?? ""}
              fieldKey={`${contact.id}-email-${contact.email ?? ""}`}
              placeholder="name@company.com"
              disabled={editLocked}
              lockHint={lockHint}
              onSave={(raw) => saveField("email", raw)}
            />
            <EditableInfoRow
              icon={<PhoneIcon className="h-4 w-4" />}
              label="Phone"
              defaultValue={contact.phone ?? ""}
              fieldKey={`${contact.id}-phone-${contact.phone ?? ""}`}
              placeholder="Phone number"
              disabled={editLocked}
              lockHint={lockHint}
              onSave={(raw) => saveField("phone", raw)}
            />
            <EditableInfoRow
              icon={<PinIcon className="h-4 w-4" />}
              label="Location"
              defaultValue={contact.location ?? ""}
              fieldKey={`${contact.id}-loc-${contact.location ?? ""}`}
              placeholder="City or region"
              disabled={editLocked}
              lockHint={lockHint}
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
                    disabled={editLocked}
                    title={editLocked ? lockHint : undefined}
                    onClick={() => {
                      setComposer("note");
                      setNoteDate(todayIsoDate());
                      setNoteText("");
                    }}
                    className="text-[11px] text-amber-300 hover:underline disabled:opacity-50"
                  >
                    Add Note
                  </button>
                </Lockable>
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    title={editLocked ? lockHint : undefined}
                    onClick={() => {
                      setComposer("follow_up");
                      setNoteDate(addDaysIso(7));
                      setNoteText("Follow up");
                    }}
                    className="text-[11px] text-violet-300 hover:underline disabled:opacity-50"
                  >
                    Follow up
                  </button>
                </Lockable>
              </div>
            </div>

            {composer ? (
              <div className="mb-4 space-y-2 rounded-xl border border-white/10 bg-ink-900/60 p-3">
                <DatePicker
                  label={composer === "follow_up" ? "Follow up on" : "Date"}
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
                  placeholder={composer === "follow_up" ? "Follow up" : "What happened…"}
                />
                <div className="flex flex-wrap gap-2">
                  <Lockable>
                    <button
                      type="button"
                      disabled={editLocked || (composer === "note" && !noteText.trim())}
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

            {followUps.length === 0 && !composer ? (
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

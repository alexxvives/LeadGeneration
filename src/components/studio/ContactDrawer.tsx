"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Contact, FollowUp } from "@/lib/types";
import { newId } from "@/lib/id";
import {
  addDaysIso,
  formatNoteDate,
  isUserFollowUp,
  resolveFollowUpKind,
  sortFollowUpsNewestFirst,
  todayIsoDate,
} from "@/lib/follow-ups";
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

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
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
  onClose,
  onUpdate,
  onDelete,
}: {
  contact: Contact;
  boardName: string;
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

  const followUps = useMemo(
    () => sortFollowUpsNewestFirst(contact.followUps ?? []),
    [contact.followUps],
  );
  const pending =
    contact.followUps?.filter((f) => isUserFollowUp(f) && !f.done).length ?? 0;

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute("disabled"))
        : [];
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  const addEntry = async (kind: "note" | "follow_up") => {
    const text = noteText.trim() || (kind === "follow_up" ? "Follow up" : "");
    if (!text || editLocked) return;
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

  const saveField = (
    field: "organization" | "email" | "phone" | "location",
    raw: string,
  ) => {
    const next = raw.trim() || null;
    const cur = contact[field]?.trim() || null;
    if (next !== cur) {
      void onUpdate(contact.id, { [field]: next });
    }
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
              {initials(contact.name)}
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
              <SectionLabel>Journal</SectionLabel>
              <div className="flex flex-wrap gap-2">
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    title={editLocked ? lockHint : "Add note"}
                    onClick={() => {
                      setComposer("note");
                      setNoteDate(todayIsoDate());
                      setNoteText("");
                    }}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-mist-200 hover:bg-white/5 disabled:opacity-50"
                  >
                    Add note
                  </button>
                </Lockable>
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    title={editLocked ? lockHint : "Schedule follow-up"}
                    onClick={() => {
                      setComposer("follow_up");
                      setNoteDate(addDaysIso(7));
                      setNoteText("Follow up");
                    }}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-mist-200 hover:bg-white/5 disabled:opacity-50"
                  >
                    Follow up
                  </button>
                </Lockable>
              </div>
            </div>

            {composer ? (
              <div className="mb-4 space-y-2 rounded-xl border border-white/10 bg-ink-950/40 p-3">
                <DatePicker
                  value={noteDate}
                  onChange={setNoteDate}
                  disabled={editLocked}
                />
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  disabled={editLocked}
                  className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-mist-100 outline-none focus:border-aurora-400/60 disabled:opacity-50"
                  placeholder={composer === "follow_up" ? "Follow up" : "Note"}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setComposer(null)}
                    className="text-xs text-mist-400 hover:text-mist-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => void addEntry(composer)}
                    className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : null}

            <ul className="space-y-2">
              {followUps.length === 0 ? (
                <li className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-mist-500">
                  No notes yet — log calls, meetings, or follow-ups here.
                </li>
              ) : (
                followUps.map((fu) => {
                  const kind = resolveFollowUpKind(fu);
                  return (
                    <li
                      key={fu.id}
                      className="rounded-xl border border-white/5 bg-ink-950/40 px-3 py-2.5"
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
                        className={`mt-1.5 text-sm leading-relaxed ${
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
                            disabled={editLocked}
                            title={editLocked ? lockHint : undefined}
                            onClick={() => {
                              const next = (contact.followUps ?? []).map((f) =>
                                f.id === fu.id ? { ...f, done: !f.done } : f,
                              );
                              void onUpdate(contact.id, { followUps: next });
                            }}
                            className="mt-1.5 text-xs text-aurora-300 hover:text-aurora-200 disabled:opacity-50"
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
          </section>
        </div>
      </aside>
    </div>
  );
}

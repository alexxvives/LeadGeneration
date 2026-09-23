"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactMethod, ConversationStep, CrmStage, DeliveryStatus, FollowUp, FollowUpKind, LeadWithOutreach } from "@/lib/types";
import type { Capabilities } from "@/lib/config";
import { Spinner } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  ArrowIcon,
  BuildingIcon,
  GlobeIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
  SparkIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { CONVERSATION_STEPS, isConversationUnresponsive } from "@/lib/conversation-steps";
import { newId } from "@/lib/id";
import { displayWebsite, isUsableWebsite } from "@/lib/website";
import {
  addDaysIso,
  collapseEmailSentFollowUps,
  emailSentFollowUpId,
  followUpIsDone,
  hasEmailSentOn,
  isEmailSentNote,
  mergeFollowUpLists,
  inferFollowUpKind,
  emailSentNotePrefix,
  isBounceNote,
  isContactRegisteredNote,
  missedCallNotePrefix,
  normalizeEmailSentNote,
  normalizeMissedCallNote,
  phoneCallNotePrefix,
  resolveFollowUpKind,
  todayIsoDate,
  withFollowUpAuthor,
} from "@/lib/follow-ups";
import { normalizePitchHtml } from "@/lib/outreach/rich-text";
import { PitchEditor } from "@/components/studio/PitchEditor";
import { Bone, LeadDrawerPendingSkeleton } from "@/components/studio/skeletons";
import { Lockable, useBoardLockUi } from "@/components/studio/board-lock";
import { LeadDocuments } from "@/components/studio/LeadDocuments";
import { JournalEntries } from "@/components/studio/JournalEntries";
import { parseRecipientEmail, sanitizeEmailList } from "@/lib/email/address";
import {
  toggleContactMethod,
  contactMethodsEqual,
  mergeContactMethods,
} from "@/lib/contact-methods";

function sameDraft(
  a: { subject: string; body: string; toEmail: string },
  b: { subject: string; body: string; toEmail: string },
): boolean {
  return (
    a.subject === b.subject &&
    a.body === b.body &&
    a.toEmail === b.toEmail
  );
}

interface DrawerProps {
  lead: LeadWithOutreach;
  capabilities: Capabilities;
  /** info = CRM/profile only; draft = outreach composer only */
  mode?: "info" | "draft";
  /** Open the dated-note composer for a call log (connected or missed). */
  promptNote?: false | "call" | "missed";
  /** Display name of the signed-in user — stamped as journal authorName. */
  actorName?: string | null;
  /** Undo a mistaken Ready→Contacted mark (phone / form log). */
  onUndoMarkContacted?: () => Promise<void>;
  /** Clear the post-call prompt chrome after the user saves a note. */
  onPromptNoteDone?: () => void;
  onClose: () => void;
  onDraft: (leadId: string) => Promise<void | boolean | string | null>;
  onSaveDraft: (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
    opts?: { silent?: boolean },
  ) => Promise<void>;
  /** Returns true when the email was actually sent (drawer should close). */
  onSend: (outreachId: string) => Promise<boolean | void>;
  onSetDelivery: (outreachId: string, deliveryStatus: DeliveryStatus) => Promise<void>;
  onUpdateCrm: (
    leadId: string,
    patch: {
      crmStage?: CrmStage;
      contactMethods?: ContactMethod[];
      notes?: string | null;
      companyType?: string | null;
      company?: string;
      website?: string | null;
      emails?: string[];
      phones?: string[];
      location?: string | null;
      aboutBlurb?: string | null;
      followUps?: FollowUp[];
      waitingOnUs?: boolean;
      demoDone?: boolean;
      conversationStep?: ConversationStep | null;
      conversationStepAt?: string | null;
    },
  ) => Promise<void>;
  /** Parent-owned note-delete undo (survives drawer remounts). */
  deletedNote?: FollowUp | null;
  onNoteDeleted?: (note: FollowUp) => void;
  onUndoDeletedNote?: () => void;
  /** Delete this lead (info + draft drawers). Disabled when the board is view-only. */
  onDeleteLead?: (leadId: string) => Promise<void> | void;
}

function parseList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── CRM stage config ─────────────────────────────────────────────────────────

const CRM_STAGES: { stage: CrmStage; label: string; color: string }[] = [
  { stage: "new",             label: "New",             color: "pill-neutral" },
  { stage: "contacted",       label: "Contacted",       color: "pill-amber" },
  { stage: "in_conversation", label: "In Conversation", color: "pill-sky" },
  { stage: "closed",          label: "Closed",          color: "pill-aurora" },
  { stage: "not_interested",  label: "Not Interested",  color: "pill-rose" },
];

const CONTACT_METHODS: { method: ContactMethod; label: string }[] = [
  { method: "email",        label: "Email" },
  { method: "phone",        label: "Phone" },
  { method: "contact_form", label: "Contact form" },
  { method: "instagram",    label: "Instagram" },
  { method: "whatsapp",     label: "WhatsApp" },
  { method: "organic",      label: "Organic" },
];

function ContactMethodChips({
  selected,
  onToggle,
  disabled,
  lockHint,
  emphasize = false,
}: {
  selected: ContactMethod[];
  onToggle: (method: ContactMethod) => void;
  disabled: boolean;
  lockHint: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CONTACT_METHODS.map(({ method, label }) => {
        const on = selected.includes(method);
        return (
          <Lockable key={method}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggle(method)}
              title={disabled ? lockHint : label}
              className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-60 ${
                on
                  ? emphasize
                    ? "bg-amber-400 text-on-accent"
                    : "bg-aurora-400/20 text-aurora-200 ring-1 ring-aurora-400/40"
                  : emphasize
                    ? "border border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                    : "border border-white/15 text-mist-400 hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          </Lockable>
        );
      })}
    </div>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

export function LeadDrawer(props: DrawerProps) {
  const { lead, capabilities, onClose } = props;
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const mode = props.mode ?? "info";
  const promptNote = props.promptNote ?? false;
  const actorName =
    props.actorName?.trim() ||
    lead.contactedByName?.trim() ||
    "you";
  const outreach = lead.outreach;

  const initialTo = outreach?.toEmail ?? lead.emails[0] ?? "";
  const [subject, setSubject] = useState(outreach?.subject ?? "");
  const [body, setBody] = useState(outreach?.body ?? "");
  const [toEmail, setToEmail] = useState(initialTo);
  const [savedDraft, setSavedDraft] = useState({
    subject: outreach?.subject ?? "",
    body: outreach?.body ?? "",
    toEmail: initialTo,
  });
  const [busy, setBusy] = useState<null | string>(null);

  // CRM state (local, synced on changes)
  const [crmStage, setCrmStage] = useState<CrmStage>(lead.crmStage ?? "new");
  const [conversationStep, setConversationStep] = useState<ConversationStep>(
    lead.conversationStep ?? "evaluating",
  );
  const [contactMethods, setContactMethods] = useState<ContactMethod[]>(
    lead.contactMethods ?? [],
  );
  const [followUps, setFollowUps] = useState<FollowUp[]>(lead.followUps ?? []);
  const [showAddNote, setShowAddNote] = useState(Boolean(promptNote));
  const [composerKind, setComposerKind] = useState<
    "note" | "follow_up" | "task"
  >("note");
  const [newNoteDate, setNewNoteDate] = useState(todayIsoDate);
  const [newNoteText, setNewNoteText] = useState(() =>
    promptNote === "missed"
      ? missedCallNotePrefix(actorName)
      : promptNote === "call"
        ? phoneCallNotePrefix(actorName)
        : "",
  );
  /** Local composer when Phone/Email is toggled in the drawer (not from Ready). */
  const [callPrompt, setCallPrompt] = useState<
    false | "call" | "missed" | "email"
  >(promptNote);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const notesPaneRef = useRef<HTMLElement | null>(null);
  const companyInputRef = useRef<HTMLInputElement | null>(null);
  const [companyInvalid, setCompanyInvalid] = useState(false);
  const [companyShaking, setCompanyShaking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editText, setEditText] = useState("");
  const followUpsLeadIdRef = useRef(lead.id);
  const healedEmailKeyRef = useRef<string | null>(null);
  const deletedNote = props.deletedNote ?? null;

  const dirty = useMemo(
    () => !sameDraft({ subject, body, toEmail }, savedDraft),
    [subject, body, toEmail, savedDraft],
  );

  // Reset composer when switching leads / server draft — never while local edits are dirty.
  useEffect(() => {
    if (dirty) return;
    const next = {
      subject: outreach?.subject ?? "",
      body: outreach?.body ?? "",
      toEmail: outreach?.toEmail ?? lead.emails[0] ?? "",
    };
    setSubject(next.subject);
    setBody(next.body);
    setToEmail(next.toEmail);
    setSavedDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skip while dirty; only sync from server ids/fields
  }, [lead.id, outreach?.id, outreach?.subject, outreach?.body, outreach?.toEmail]);

  useEffect(() => {
    const leadChanged = followUpsLeadIdRef.current !== lead.id;
    const nextStage = lead.crmStage ?? "new";
    const incomingMethods = lead.contactMethods ?? [];
    const droppedMethods = lead.droppedContactMethods?.length
      ? new Set(lead.droppedContactMethods)
      : undefined;
    const nextMethods = leadChanged
      ? incomingMethods
      : mergeContactMethods(contactMethods, incomingMethods, droppedMethods);
    if (leadChanged || crmStage !== nextStage) setCrmStage(nextStage);
    const nextStep = lead.conversationStep ?? "evaluating";
    if (leadChanged || conversationStep !== nextStep) setConversationStep(nextStep);
    if (leadChanged || !contactMethodsEqual(contactMethods, nextMethods)) {
      setContactMethods(nextMethods);
    }
    const raw = lead.followUps ?? [];
    const collapsed = collapseEmailSentFollowUps(raw, lead.contactedByName)
      .filter((f) => !isBounceNote(f.note) && !isContactRegisteredNote(f.note))
      .map((f) => {
        const note = normalizeEmailSentNote(normalizeMissedCallNote(f.note));
        const kind = resolveFollowUpKind({ ...f, note });
        if (kind === f.kind && note === f.note) return f;
        return {
          ...f,
          note,
          kind,
          done:
            kind === "phone" || kind === "email" || kind === "note"
              ? true
              : f.done,
        };
      });
    followUpsLeadIdRef.current = lead.id;
    const dropped = new Set(lead.droppedFollowUpIds ?? []);
    if (deletedNote) dropped.add(deletedNote.id);
    const detailReady = lead.detailLoaded === true;
    const next = leadChanged
      ? collapsed.filter((f) => !dropped.has(f.id))
      : mergeFollowUpLists(
          followUps,
          collapsed,
          dropped.size ? dropped : undefined,
          // Slim rows strip note bodies — once the drawer GET lands, take
          // server text so journals aren't stuck blank until remount.
          detailReady ? { preferIncoming: true } : undefined,
        );
    const journalSame =
      !leadChanged &&
      next.length === followUps.length &&
      next.every(
        (f, i) =>
          f.id === followUps[i]?.id &&
          f.note === followUps[i]?.note &&
          f.date === followUps[i]?.date &&
          f.done === followUps[i]?.done &&
          f.kind === followUps[i]?.kind &&
          (f.authorName ?? null) === (followUps[i]?.authorName ?? null),
      );
    if (!journalSame) setFollowUps(next);
    setConfirmDelete(false);
    const changed =
      collapsed.length !== raw.length ||
      collapsed.some(
        (f, i) =>
          f.kind !== raw[i]?.kind ||
          f.done !== raw[i]?.done ||
          f.note !== raw[i]?.note,
      );
    // Heal kinds on the merged list — never PATCH a stale subset that would
    // delete a note the user just added, and wait for full detail so we don't
    // race the in-flight GET with a slim payload.
    const removed = raw.filter((f) => !next.some((n) => n.id === f.id));
    const removedOnlyEmailDupes =
      removed.length > 0 &&
      removed.every(
        (f) => isEmailSentNote(f.note) || (!f.note.trim() && f.kind === "email"),
      );
    if (
      changed &&
      !deletedNote &&
      lead.detailLoaded === true &&
      (removedOnlyEmailDupes ||
        (next.length >= raw.length && next.length >= followUps.length))
    ) {
      void props.onUpdateCrm(lead.id, { followUps: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heal journal kinds; keep local extras across stale props
  }, [lead.id, lead.crmStage, lead.contactMethods, lead.followUps, lead.contactedByName, lead.detailLoaded, deletedNote?.id]);

  useEffect(() => {
    if (promptNote) {
      setShowAddNote(true);
      setCallPrompt(promptNote);
      setNewNoteDate(todayIsoDate());
      setNewNoteText(
        promptNote === "missed"
          ? missedCallNotePrefix(actorName)
          : phoneCallNotePrefix(actorName),
      );
    } else {
      setShowAddNote(false);
      setCallPrompt(false);
      setNewNoteDate(todayIsoDate());
      setNewNoteText("");
    }
    // Don't depend on actorName — session hydrate must not wipe a typed call note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, promptNote]);

  // Heal: older sends wrote status but skipped the dated journal. One line
  // per lead per day — merge used to put a collapsed duplicate back.
  useEffect(() => {
    if (outreach?.status !== "sent" || !outreach.sentAt) return;
    if (lead.detailLoaded !== true) return;
    const sentDay = outreach.sentAt.slice(0, 10);
    const key = `${lead.id}:${sentDay}`;
    if (healedEmailKeyRef.current === key) return;
    healedEmailKeyRef.current = key;
    const existing = lead.followUps ?? [];
    const collapsed = collapseEmailSentFollowUps(
      existing,
      lead.contactedByName,
    );
    if (hasEmailSentOn(collapsed, sentDay)) {
      if (collapsed.length !== existing.length) {
        setFollowUps(collapsed);
        void props.onUpdateCrm(lead.id, { followUps: collapsed });
      }
      return;
    }
    const actor = lead.contactedByName?.trim();
    const inserted: FollowUp = withFollowUpAuthor(
      {
        id: emailSentFollowUpId(lead.id, sentDay),
        date: sentDay,
        note: "Email sent",
        done: true,
        kind: "email",
      },
      actor ?? actorName,
    );
    const updated = collapseEmailSentFollowUps(
      [inserted, ...collapsed],
      lead.contactedByName,
    );
    setFollowUps(updated);
    void props.onUpdateCrm(lead.id, { followUps: updated });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot heal per lead/sent day
  }, [lead.id, outreach?.status, outreach?.sentAt, lead.detailLoaded]);

  useEffect(() => {
    if (!showAddNote) return;
    const t = window.setTimeout(() => {
      const el = noteInputRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }, 80);
    return () => window.clearTimeout(t);
  }, [showAddNote, lead.id, callPrompt, composerKind]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const flashCompanyRequired = () => {
    setCompanyInvalid(true);
    setCompanyShaking(false);
    // Retrigger CSS animation on repeated submits.
    requestAnimationFrame(() => setCompanyShaking(true));
    const el = companyInputRef.current;
    if (el) {
      el.focus();
      el.select?.();
    }
  };

  const companyNameOk = () => {
    const typed = companyInputRef.current?.value.trim();
    const name = (typed ?? lead.company).trim();
    return name.length > 0;
  };

  const requestClose = () => {
    if (mode === "info" && !companyNameOk()) {
      flashCompanyRequired();
      return;
    }
    if (
      dirtyRef.current &&
      !window.confirm(
        "You have unsaved email changes. Leave without saving?",
      )
    ) {
      return;
    }
    onCloseRef.current();
  };

  const panelRef = useRef<HTMLElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap once per open lead — do NOT re-run on subject/body keystrokes
  // (that was stealing focus to the close X after every character).
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute("disabled"))
        : [];
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const list = focusables();
      if (list.length === 0) return;
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocusRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/lead only
  }, [lead.id]);

  /** Persist composer fields before send so edits aren't lost. */
  const persistIfDirty = async () => {
    if (editLocked) return;
    if (!outreach || !dirty) return;
    await props.onSaveDraft(
      outreach.id,
      { subject, body, toEmail: toEmail || null },
      { silent: true },
    );
    setSavedDraft({ subject, body, toEmail });
  };

  const run = async (key: string, fn: () => Promise<void | boolean>) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };

  // ── CRM stage change ──
  const handleStageClick = (stage: CrmStage) => {
    if (editLocked) return;
    // Moving to New clears methods; Contacted no longer forces a method popup.
    const nextMethods = stage === "new" ? [] : contactMethods;
    void commitStage(stage, nextMethods);
  };

  const commitStage = async (stage: CrmStage, methods: ContactMethod[]) => {
    setCrmStage(stage);
    setContactMethods(methods);
    await props.onUpdateCrm(lead.id, {
      crmStage: stage,
      contactMethods: methods,
    });
  };

  /** Toggle a contact method (multi-select). Phone/email open a journal composer. */
  const toggleMethod = async (method: ContactMethod) => {
    if (editLocked) return;
    if (method === "email") {
      if (!contactMethods.includes("email")) {
        const next: ContactMethod[] = [...contactMethods, "email"];
        const stage = crmStage === "new" ? "contacted" : crmStage;
        await commitStage(stage, next);
      }
      setCallPrompt("email");
      setShowAddNote(true);
      setComposerKind("note");
      setNewNoteDate(todayIsoDate());
      setNewNoteText(emailSentNotePrefix(actorName));
      return;
    }
    const addedPhone = method === "phone" && !contactMethods.includes("phone");
    const next = toggleContactMethod(contactMethods, method);
    const stage =
      next.length > 0 && crmStage === "new" ? "contacted" : crmStage;
    await commitStage(stage, next);
    if (addedPhone) {
      setCallPrompt("call");
      setShowAddNote(true);
      setComposerKind("note");
      setNewNoteDate(todayIsoDate());
      setNewNoteText(phoneCallNotePrefix(actorName));
    }
  };

  const isPastNew =
    crmStage === "contacted" ||
    crmStage === "in_conversation" ||
    crmStage === "closed" ||
    crmStage === "not_interested";
  const needsMethod = isPastNew && contactMethods.length === 0;
  const outreachSent = outreach?.status === "sent";
  const hasUsableEmail = Boolean(
    (outreach?.toEmail ?? lead.emails[0] ?? "").trim(),
  );
  /** Phone/form/IG-only (no email) — log channels; email leads can still draft/send. */
  const registerOnly = isPastNew && !outreachSent && !hasUsableEmail;

  const promptingCall =
    callPrompt === "call" ||
    callPrompt === "missed" ||
    promptNote === "call" ||
    promptNote === "missed";
  const promptingEmail = callPrompt === "email";
  const promptingChannel = promptingCall || promptingEmail;

  const openComposer = (kind: "note" | "follow_up" | "task") => {
    if (editLocked) return;
    setShowAddNote(true);
    setCallPrompt(false);
    setComposerKind(kind);
    if (kind === "follow_up") {
      setNewNoteDate(addDaysIso(7));
      setNewNoteText("Follow up");
    } else {
      setNewNoteDate(todayIsoDate());
      setNewNoteText("");
    }
  };

  /** Dismiss the post-contact note prompt and put the lead back in New. */
  const cancelContactPrompt = async () => {
    if (editLocked) return;
    setShowAddNote(false);
    setCallPrompt(false);
    setComposerKind("note");
    setNewNoteDate(todayIsoDate());
    setNewNoteText("");
    if (props.onUndoMarkContacted) {
      await props.onUndoMarkContacted();
      return;
    }
    await commitStage("new", []);
    if (promptNote) props.onPromptNoteDone?.();
  };

  // ── Dated notes (journal) ──
  const addNote = async (variant?: "call" | "missed" | "email") => {
    if (editLocked) return;
    const callMode = variant ?? (callPrompt || (promptNote ? promptNote : false));
    let text = newNoteText.trim();
    if (callMode === "missed") {
      text = missedCallNotePrefix(actorName).trim();
    } else if (callMode === "call" && !text) {
      text = phoneCallNotePrefix(actorName).trim();
    } else if (callMode === "email" && !text) {
      text = emailSentNotePrefix(actorName).trim();
    }
    if (callMode === "email") text = normalizeEmailSentNote(text);
    if (!newNoteDate || !text) return;
    const inferred = inferFollowUpKind(text);
    const isCall =
      inferred === "phone" || callMode === "call" || callMode === "missed";
    const isEmailLog = inferred === "email" || callMode === "email";
    const kind: FollowUpKind = isCall
      ? "phone"
      : isEmailLog
        ? "email"
        : composerKind === "follow_up"
          ? "follow_up"
          : composerKind === "task"
            ? "task"
            : "note";
    const bareEmail = isEmailLog && /^email sent$/i.test(text);
    const fu = withFollowUpAuthor(
      {
        id: bareEmail ? emailSentFollowUpId(lead.id, newNoteDate) : newId("fu"),
        date: newNoteDate,
        note: text,
        done: isCall || isEmailLog || kind === "note",
        kind,
      },
      actorName,
    );
    const withoutSame = bareEmail
      ? followUps.filter((f) => f.id !== fu.id)
      : followUps;
    const updated = collapseEmailSentFollowUps([...withoutSame, fu], actorName);
    setFollowUps(updated);
    setShowAddNote(false);
    setCallPrompt(false);
    setComposerKind("note");
    setNewNoteDate(todayIsoDate());
    setNewNoteText("");
    // Missed = journal only. A connected call (Save / Skip details) is what
    // advances CRM — otherwise Ready phone-only leads jumped to Contacted.
    let crmPatch: {
      followUps: FollowUp[];
      notes: null;
      crmStage?: CrmStage;
      contactMethods?: ContactMethod[];
    } = { followUps: updated, notes: null };
    if (callMode === "missed") {
      const methods = contactMethods.filter((m) => m !== "phone");
      const stage =
        methods.length === 0 && (crmStage === "contacted" || crmStage === "new")
          ? "new"
          : crmStage;
      crmPatch = {
        ...crmPatch,
        crmStage: stage,
        contactMethods: methods,
      };
      setCrmStage(stage);
      setContactMethods(methods);
    } else if (callMode === "call") {
      const methods: ContactMethod[] = contactMethods.includes("phone")
        ? contactMethods
        : [...contactMethods, "phone"];
      const stage = crmStage === "new" ? "contacted" : crmStage;
      crmPatch = {
        ...crmPatch,
        crmStage: stage,
        contactMethods: methods,
      };
      setCrmStage(stage);
      setContactMethods(methods);
    } else if (callMode === "email") {
      const methods: ContactMethod[] = contactMethods.includes("email")
        ? contactMethods
        : [...contactMethods, "email"];
      const stage = crmStage === "new" ? "contacted" : crmStage;
      crmPatch = {
        ...crmPatch,
        crmStage: stage,
        contactMethods: methods,
      };
      setCrmStage(stage);
      setContactMethods(methods);
    }
    await props.onUpdateCrm(lead.id, crmPatch);
    if (promptNote) props.onPromptNoteDone?.();
  };

  const deleteFollowUp = async (fuId: string) => {
    if (editLocked) return;
    const removed = followUps.find((f) => f.id === fuId);
    if (!removed) return;
    const previous = followUps;
    const updated = followUps.filter((f) => f.id !== fuId);
    setFollowUps(updated);
    if (editingId === fuId) setEditingId(null);
    props.onNoteDeleted?.(removed);
    try {
      await props.onUpdateCrm(lead.id, { followUps: updated });
    } catch {
      setFollowUps(previous);
    }
  };

  const toggleFollowUpDone = async (fu: FollowUp) => {
    if (editLocked) return;
    const nextDone = !followUpIsDone(fu.done);
    const updated = followUps.map((f) =>
      f.id === fu.id ? { ...f, done: nextDone } : f,
    );
    setFollowUps(updated);
    await props.onUpdateCrm(lead.id, { followUps: updated });
  };

  const startEditFollowUp = (fu: FollowUp) => {
    if (editLocked) return;
    setEditingId(fu.id);
    setEditDate(fu.date);
    setEditText(fu.note);
  };

  const saveEditFollowUp = async () => {
    if (editLocked || !editingId || !editDate) return;
    const updated = followUps.map((f) =>
      f.id === editingId
        ? {
            ...f,
            date: editDate,
            note: normalizeEmailSentNote(
              normalizeMissedCallNote(editText.trim()),
            ),
          }
        : f,
    );
    setFollowUps(updated);
    setEditingId(null);
    await props.onUpdateCrm(lead.id, { followUps: updated });
  };

  /** Recipient required; Send is the per-lead human gate. */
  const canSend = Boolean(parseRecipientEmail(toEmail));
  const sent = outreach?.status === "sent";

  return (
    // Above Leaflet panes/controls (marker ~600, control ~1000).
    <div className="fixed inset-0 z-[1100] flex items-stretch justify-center p-0 md:items-center md:p-4 lg:p-6">
      <div
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={requestClose}
        aria-hidden
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-drawer-title"
        aria-busy={lead.detailLoaded !== true}
        className={`relative flex w-full flex-col overflow-hidden border-white/10 bg-ink-900 shadow-2xl max-md:h-dvh max-md:border-0 md:animate-float-up md:border ${
          mode === "info"
            ? "max-md:max-h-none md:max-h-[min(90dvh,720px)] md:max-w-[67.1rem] md:rounded-xl2"
            : "max-md:max-h-none md:h-[min(90dvh,860px)] md:max-w-[56rem] md:rounded-xl2"
        }`}
      >

        {/* Header */}
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/5 bg-ink-900/90 p-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl md:p-6 md:pt-6">
          <div className="min-w-0 flex-1 pr-2">
            {lead.detailLoaded !== true ? (
              <p className="sr-only" role="status">
                Loading full details
              </p>
            ) : null}
            {mode === "draft" ? (
              <>
                <h2
                  id="lead-drawer-title"
                  className="truncate font-display text-2xl font-semibold"
                >
                  Draft
                </h2>
                <p className="mt-1 truncate text-sm text-mist-500">{lead.company}</p>
              </>
            ) : (
              <div className="min-w-0">
                <input
                  id="lead-drawer-title"
                  ref={companyInputRef}
                  key={`${lead.id}-company-${lead.company}`}
                  defaultValue={lead.company}
                  placeholder="Company name"
                  disabled={editLocked}
                  title={editLocked ? lockHint : undefined}
                  aria-invalid={companyInvalid}
                  aria-required
                  onChange={(e) => {
                    if (companyInvalid && e.target.value.trim()) {
                      setCompanyInvalid(false);
                    }
                  }}
                  onBlur={(e) => {
                    if (editLocked) return;
                    const next = e.target.value.trim();
                    if (!next) {
                      // Don't shake on blur — only on submit (Enter / close).
                      if (lead.company.trim()) {
                        e.target.value = lead.company;
                      }
                      return;
                    }
                    setCompanyInvalid(false);
                    if (next !== lead.company) {
                      void props.onUpdateCrm(lead.id, { company: next });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (editLocked) return;
                    const next = e.currentTarget.value.trim();
                    if (!next) {
                      flashCompanyRequired();
                      return;
                    }
                    setCompanyInvalid(false);
                    e.currentTarget.blur();
                    if (next !== lead.company) {
                      void props.onUpdateCrm(lead.id, { company: next });
                    }
                  }}
                  aria-label={editLocked ? lockHint : "Company name"}
                  onAnimationEnd={() => setCompanyShaking(false)}
                  className={`w-full min-w-0 rounded-md py-0.5 font-display text-xl font-semibold tracking-tight outline-none sm:text-2xl ${
                    companyInvalid
                      ? `bg-rose-500/10 text-rose-100 ring-2 ring-rose-400/70 placeholder:text-rose-300/70 ${
                          companyShaking ? "animate-field-shake" : ""
                        }`
                      : "bg-transparent text-mist-100 placeholder:text-mist-500 focus:bg-ink-950/40 focus:underline focus:decoration-aurora-400/50"
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                />
                {companyInvalid ? (
                  <p className="mt-1 text-xs font-medium text-rose-300" role="alert">
                    Company name is required
                  </p>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {props.onDeleteLead ? (
              confirmDelete && !editLocked ? (
                <div className="mr-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void props.onDeleteLead!(lead.id);
                    }}
                    className="rounded-full bg-rose-400 px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-rose-300"
                  >
                    Delete lead
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
                      editLocked ? lockHint : `Delete ${lead.company}`
                    }
                    title={editLocked ? lockHint : "Delete lead"}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </Lockable>
              )
            ) : null}
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg p-2 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100"
              aria-label="Close (Esc)"
              title="Close (Esc)"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className={
            mode === "info"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6"
          }
        >
          {mode === "info" ? (
            <>
          <div className="grid min-h-0 flex-1 overflow-hidden sm:grid-cols-[minmax(0,1.25fr)_minmax(15rem,0.9fr)]">
          <div className="min-h-0 space-y-6 overflow-y-auto p-4 md:p-6">
          {/* CRM Stage picker */}
          <section>
            <SectionLabel>Sales stage</SectionLabel>
            <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
              {CRM_STAGES.map(({ stage, label, color }) => (
                <Lockable key={stage} className="shrink-0">
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => handleStageClick(stage)}
                    title={editLocked ? lockHint : undefined}
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-all disabled:opacity-60 ${
                      crmStage === stage
                        ? color
                        : "bg-white/5 text-mist-500 ring-white/10 hover:text-mist-300"
                    }`}
                  >
                    {label}
                  </button>
                </Lockable>
              ))}
            </div>

            {/* How contacted — skip In Conversation (collaborators already reached). */}
            {crmStage !== "new" && crmStage !== "in_conversation" && (
              <div
                className={`mt-3 rounded-xl px-3 py-2.5 ${
                  needsMethod
                    ? "border border-amber-400/40 bg-amber-400/10 ring-1 ring-amber-400/20"
                    : "border border-white/10 bg-white/[0.03]"
                }`}
              >
                <p
                  className={`text-xs font-medium ${
                    needsMethod ? "text-amber-300" : "text-mist-400"
                  }`}
                >
                  {needsMethod ? "How did you reach them?" : "Reached via"}
                </p>
                <div className="mt-1.5">
                  <ContactMethodChips
                    selected={contactMethods}
                    onToggle={(m) => void toggleMethod(m)}
                    disabled={editLocked}
                    lockHint={lockHint}
                    emphasize={needsMethod}
                  />
                </div>
              </div>
            )}

            {crmStage === "in_conversation" ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <label className="block text-xs font-medium text-mist-400" htmlFor={`conv-step-${lead.id}`}>
                  Where they are
                </label>
                <Select
                  id={`conv-step-${lead.id}`}
                  className="mt-1.5 w-full"
                  disabled={editLocked}
                  title={editLocked ? lockHint : "Conversation step"}
                  value={conversationStep}
                  onChange={(e) => {
                    const next = e.target.value as ConversationStep;
                    setConversationStep(next);
                    void props.onUpdateCrm(lead.id, {
                      crmStage: "in_conversation",
                      conversationStep: next,
                      conversationStepAt: todayIsoDate(),
                    });
                  }}
                >
                  {CONVERSATION_STEPS.map((step) => (
                    <option key={step.id} value={step.id}>
                      {step.label}
                    </option>
                  ))}
                </Select>
                {isConversationUnresponsive(lead) ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-rose-200/90">
                    Unresponsive — the latest note is more than two weeks old and there is no open task.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* Contact info — all fields editable */}
          <section className="grid gap-2.5">
            <div className="grid gap-1">
              <div className="flex items-center justify-end gap-2 pl-7">
                {isUsableWebsite(lead.website) ? (
                  <a
                    href={lead.website!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-aurora-300 hover:underline"
                  >
                    Open {displayWebsite(lead.website)}
                  </a>
                ) : (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      [lead.company, lead.location].filter(Boolean).join(" "),
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-aurora-300 hover:underline"
                  >
                    No website on file — Google search for this lead
                  </a>
                )}
              </div>
              <EditableInfoRow
                icon={<GlobeIcon className="h-4 w-4" />}
                label="Website"
                defaultValue={lead.website ?? ""}
                fieldKey={`${lead.id}-website-${lead.website ?? ""}`}
                placeholder="https://…"
                disabled={editLocked}
                lockHint={lockHint}
                onSave={(raw) => {
                  const next = raw.trim() || null;
                  if (next !== (lead.website ?? null)) {
                    void props.onUpdateCrm(lead.id, { website: next });
                  }
                }}
              />
            </div>
            <EditableInfoRow
              icon={<BuildingIcon className="h-4 w-4" />}
              label="Company type"
              defaultValue={lead.companyType ?? ""}
              fieldKey={`${lead.id}-ctype-${lead.companyType ?? ""}`}
              placeholder="Company type — e.g. Pharmacy"
              disabled={editLocked}
              lockHint={lockHint}
              onSave={(raw) => {
                const next = raw.trim() || null;
                if (next !== (lead.companyType ?? null)) {
                  void props.onUpdateCrm(lead.id, { companyType: next });
                }
              }}
            />
            <EditableInfoRow
              icon={<MailIcon className="h-4 w-4" />}
              label="Emails"
              defaultValue={lead.emails.join(", ")}
              fieldKey={`${lead.id}-emails-${lead.emails.join(",")}`}
              placeholder="name@company.com"
              disabled={editLocked}
              lockHint={lockHint}
              onSave={(raw) => {
                const next = sanitizeEmailList(parseList(raw));
                if (next.join("\0") !== lead.emails.join("\0")) {
                  void props.onUpdateCrm(lead.id, { emails: next });
                }
              }}
            />
            <EditableInfoRow
              icon={<PhoneIcon className="h-4 w-4" />}
              label="Phones"
              defaultValue={lead.phones.join(", ")}
              fieldKey={`${lead.id}-phones-${lead.phones.join(",")}`}
              placeholder="Phone number"
              disabled={editLocked}
              lockHint={lockHint}
              onSave={(raw) => {
                const next = parseList(raw);
                if (next.join("\0") !== lead.phones.join("\0")) {
                  void props.onUpdateCrm(lead.id, { phones: next });
                }
              }}
            />
            <EditableInfoRow
              icon={<PinIcon className="h-4 w-4" />}
              label="Location"
              defaultValue={lead.location ?? ""}
              fieldKey={`${lead.id}-loc-${lead.location ?? ""}`}
              placeholder="City, region"
              disabled={editLocked}
              lockHint={lockHint}
              onSave={(raw) => {
                const next = raw.trim() || null;
                if (next !== (lead.location ?? null)) {
                  void props.onUpdateCrm(lead.id, { location: next });
                }
              }}
            />
          </section>
          <section>
            <SectionLabel>About</SectionLabel>
            {lead.detailLoaded !== true ? (
              <LeadDrawerPendingSkeleton variant="about" />
            ) : (
              <AutoGrowAbout
                key={`${lead.id}-about-${lead.aboutBlurb ?? ""}`}
                defaultValue={lead.aboutBlurb ?? ""}
                disabled={editLocked}
                lockHint={lockHint}
                onSave={(raw) => {
                  const next = raw.trim() || null;
                  if (next !== (lead.aboutBlurb ?? null)) {
                    void props.onUpdateCrm(lead.id, { aboutBlurb: next });
                  }
                }}
              />
            )}
          </section>
          {crmStage === "closed" ? (
            <LeadDocuments
              leadId={lead.id}
              disabled={editLocked}
              lockHint={lockHint}
            />
          ) : null}
          </div>

          {/* Notes column — grows independently so the left profile stays readable */}
          <aside
            ref={notesPaneRef}
            className="flex min-h-0 flex-col border-t border-white/5 bg-ink-950/40 sm:border-l sm:border-t-0"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
              <SectionLabel>Notes</SectionLabel>
              <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => openComposer("note")}
                    title={editLocked ? lockHint : undefined}
                    className="text-[11px] text-amber-300 hover:underline disabled:opacity-50"
                  >
                    Add Note
                  </button>
                </Lockable>
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => openComposer("follow_up")}
                    title={editLocked ? lockHint : undefined}
                    className="text-[11px] text-violet-300 hover:underline disabled:opacity-50"
                  >
                    Follow up
                  </button>
                </Lockable>
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => openComposer("task")}
                    title={editLocked ? lockHint : undefined}
                    className="text-[11px] text-aurora-300 hover:underline disabled:opacity-50"
                  >
                    Add Task
                  </button>
                </Lockable>
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => void addNote("missed")}
                    title={editLocked ? lockHint : undefined}
                    className="text-[11px] text-mist-400 hover:underline disabled:opacity-50"
                  >
                    Missed call
                  </button>
                </Lockable>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {lead.detailLoaded !== true ? (
                <LeadDrawerPendingSkeleton
                  variant="notes"
                  noteRows={Math.max(2, followUps.length)}
                />
              ) : (
                <>
              {lead.notes?.trim() && followUps.length === 0 && (
                <p className="text-sm leading-relaxed text-mist-400">
                  <span className="font-semibold text-mist-200">Earlier note:</span>{" "}
                  {lead.notes.trim()}
                </p>
              )}

              {promptingCall ? (
                <div className="rounded-xl border border-aurora-400/25 bg-aurora-400/10 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-aurora-200">
                        Log the call
                      </p>
                    </div>
                    {props.onUndoMarkContacted || promptingChannel ? (
                      <button
                        type="button"
                        disabled={busy === "undo-contact"}
                        onClick={() =>
                          void run("undo-contact", () => cancelContactPrompt())
                        }
                        className="shrink-0 rounded-full border border-white/15 bg-ink-950/40 px-2.5 py-1 text-[11px] font-medium text-mist-200 transition-colors hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-100 disabled:opacity-50"
                      >
                        {busy === "undo-contact" ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          "Cancel"
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {showAddNote && (
                <div
                  className={`space-y-2 rounded-xl border p-3 ${
                    composerKind === "task"
                      ? "border-aurora-400/35 bg-aurora-400/10"
                      : "border-white/10 bg-ink-900/60"
                  }`}
                >
                  {composerKind === "task" ? (
                    <p className="text-xs font-medium text-aurora-200">
                      What they expect from us
                    </p>
                  ) : null}
                  <DatePicker
                    label={
                      promptingCall
                        ? "Call date"
                        : promptingEmail
                          ? "Email date"
                          : composerKind === "follow_up"
                            ? "Follow up on"
                            : composerKind === "task"
                              ? "Due"
                              : "Date"
                    }
                    value={newNoteDate}
                    onChange={setNewNoteDate}
                  />
                  <textarea
                    ref={noteInputRef}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    rows={3}
                    placeholder={
                      promptingCall
                        ? "how the conversation went…"
                        : promptingEmail
                          ? "what you sent…"
                          : composerKind === "follow_up"
                            ? "Follow up"
                            : composerKind === "task"
                              ? "Proposal, callback, pricing…"
                              : "What happened…"
                    }
                    className="w-full resize-y rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-sm text-mist-100 outline-none placeholder:text-mist-600 focus:border-aurora-400/60"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Lockable>
                      <button
                        type="button"
                        onClick={() => void addNote()}
                        disabled={
                          editLocked || !newNoteDate || !newNoteText.trim()
                        }
                        title={editLocked ? lockHint : undefined}
                        className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-40"
                      >
                        Save
                      </button>
                    </Lockable>
                    {promptingCall ? (
                      <Lockable>
                        <button
                          type="button"
                          onClick={() => void addNote("missed")}
                          disabled={editLocked || !newNoteDate}
                          title={editLocked ? lockHint : undefined}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-mist-400 hover:bg-white/5 disabled:opacity-40"
                        >
                          Missed call
                        </button>
                      </Lockable>
                    ) : null}
                    {promptingChannel ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (promptingCall) {
                              void addNote("call");
                              return;
                            }
                            if (promptingEmail) {
                              void addNote("email");
                              return;
                            }
                          }}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-500 hover:text-mist-300"
                        >
                          Skip details
                        </button>
                        <button
                          type="button"
                          disabled={editLocked || busy === "undo-contact"}
                          onClick={() =>
                            void run("undo-contact", () => cancelContactPrompt())
                          }
                          title={
                            editLocked
                              ? lockHint
                              : "Cancel and move lead back to New"
                          }
                          className="ml-auto rounded-full border border-rose-400/35 px-3 py-1 text-xs font-medium text-rose-200 hover:bg-rose-400/10 disabled:opacity-50"
                        >
                          {busy === "undo-contact" ? (
                            <Spinner className="h-3 w-3" />
                          ) : (
                            "Cancel"
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddNote(false);
                          setCallPrompt(false);
                          setComposerKind("note");
                          setNewNoteText("");
                          setNewNoteDate(todayIsoDate());
                        }}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-500 hover:text-mist-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}

              {deletedNote ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
                >
                  <span>Note deleted.</span>
                  <button
                    type="button"
                    onClick={() => props.onUndoDeletedNote?.()}
                    className="rounded-full bg-amber-400/20 px-2.5 py-1 font-medium text-amber-50 hover:bg-amber-400/30"
                  >
                    Undo
                  </button>
                </div>
              ) : null}
              {followUps.length === 0 && !showAddNote ? (
                deletedNote ? null : (
                <p className="text-xs text-mist-600">
                  No notes yet.
                </p>
                )
              ) : (
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
              )}
                </>
              )}
            </div>
          </aside>
          </div>
            </>
          ) : (
            <>
          {/* Draft / register composer */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">
                {registerOnly ? "Outreach log" : "Email"}
              </h3>
              {outreach && !sent && !registerOnly ? (
                <Lockable>
                  <button
                    onClick={() =>
                      run("draft", async () => {
                        await props.onDraft(lead.id);
                      })
                    }
                    disabled={busy === "draft" || editLocked}
                    title={editLocked ? lockHint : "Rewrite this draft"}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs text-mist-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                  >
                  {busy === "draft" ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3.5 w-3.5" />}
                  Regenerate
                </button>
                </Lockable>
              ) : null}
            </div>

            {registerOnly && !outreach ? (
              <div className="space-y-3">
                <p className="text-sm text-mist-300">
                  No email on this lead — log how you reached them below. Add an
                  email in Lead info if you want to draft and send later.
                </p>
                <div
                  className={`rounded-xl px-3 py-2.5 ${
                    needsMethod
                      ? "border border-amber-400/40 bg-amber-400/10"
                      : "border border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <p
                    className={`text-xs font-medium ${
                      needsMethod ? "text-amber-300" : "text-mist-400"
                    }`}
                  >
                    {needsMethod
                      ? "Select how you reached them"
                      : "Contact channels"}
                  </p>
                  <div className="mt-2">
                    <ContactMethodChips
                      selected={contactMethods}
                      onToggle={(m) => void toggleMethod(m)}
                      disabled={editLocked}
                      lockHint={lockHint}
                      emphasize={needsMethod}
                    />
                  </div>
                </div>
                <p className="text-xs text-mist-500">
                  Use the lead card to add dated notes anytime.
                </p>
              </div>
            ) : !outreach ? (
              <div className="text-center">
                <p className="text-sm text-mist-300">
                  No draft yet. Generate a personalized first email for this lead.
                </p>
                <Lockable>
                  <button
                    onClick={() =>
                      run("draft", async () => {
                        await props.onDraft(lead.id);
                      })
                    }
                    disabled={busy === "draft" || editLocked}
                    title={editLocked ? lockHint : undefined}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-105 disabled:opacity-50"
                  >
                    {busy === "draft" ? <Spinner className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}
                    Draft outreach
                  </button>
                </Lockable>
              </div>
            ) : lead.detailLoaded !== true ? (
              <div
                className="space-y-3"
                role="status"
                aria-busy="true"
                aria-label="Loading email draft"
              >
                <FieldMini label="To">
                  <input
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    disabled
                    placeholder="name@company.com"
                    className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm outline-none disabled:opacity-60"
                  />
                </FieldMini>
                <FieldMini label="Subject">
                  <Bone className="h-10 w-full" />
                </FieldMini>
                <FieldMini label="Body">
                  <LeadDrawerPendingSkeleton variant="email" />
                </FieldMini>
              </div>
            ) : (
              <div className="space-y-3">
                <FieldMini label="To">
                  <input
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    onBlur={() => {
                      const next = parseRecipientEmail(toEmail);
                      if (toEmail.trim() && !next) {
                        setToEmail("");
                        if (lead.emails.some((e) => e.trim())) {
                          void props.onUpdateCrm(lead.id, {
                            emails: sanitizeEmailList(lead.emails),
                          });
                        }
                      } else if (next && next !== toEmail.trim()) {
                        setToEmail(next);
                      }
                    }}
                    disabled={sent || editLocked}
                    title={editLocked ? lockHint : undefined}
                    placeholder="name@company.com"
                    className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-aurora-400/60 disabled:opacity-60"
                  />
                  {toEmail.trim() && !parseRecipientEmail(toEmail) ? (
                    <p className="mt-1 text-[11px] text-rose-300">
                      Not a real address (needs name@example.com). It will be
                      removed.
                    </p>
                  ) : null}
                </FieldMini>
                <FieldMini label="Subject">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={sent || editLocked}
                    title={editLocked ? lockHint : undefined}
                    className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-aurora-400/60 disabled:opacity-60"
                  />
                </FieldMini>
                <FieldMini label="Body">
                  {sent ? (
                    <div
                      className="min-h-[6rem] rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 font-sans text-sm leading-relaxed text-mist-200 opacity-60 [&_b]:font-semibold [&_strong]:font-semibold [&_em]:italic [&_i]:italic [&_u]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5"
                      dangerouslySetInnerHTML={{
                        __html: normalizePitchHtml(body),
                      }}
                    />
                  ) : (
                    <Lockable className="w-full">
                      <PitchEditor
                        value={body}
                        onChange={(html) => setBody(html)}
                        placeholder="Email body…"
                        disabled={editLocked}
                      />
                    </Lockable>
                  )}
                </FieldMini>

                {sent ? (
                  <div className="space-y-4 pt-1">
                    <div>
                      <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-mist-500">
                        Delivery outcome
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {(
                          [
                            { id: "sent", label: "Delivered" },
                            { id: "replied", label: "Replied" },
                          ] as const
                        ).map((opt) => {
                          const active = (outreach.deliveryStatus ?? "unknown") === opt.id;
                          return (
                            <Lockable key={opt.id}>
                              <button
                                type="button"
                                disabled={busy === "delivery" || editLocked}
                                title={editLocked ? lockHint : undefined}
                                onClick={() =>
                                  run("delivery", () =>
                                    props.onSetDelivery(outreach.id, opt.id),
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-50 ${
                                  active
                                    ? opt.id === "replied"
                                      ? "bg-sky-500/15 text-sky-300 ring-sky-400/30"
                                      : "bg-aurora-400/15 text-aurora-300 ring-aurora-400/30"
                                    : "text-mist-400 ring-white/10 hover:bg-white/5 hover:text-mist-100"
                                }`}
                              >
                                {opt.label}
                              </button>
                            </Lockable>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {outreach.error && (
                  <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {outreach.status === "failed" ? "Send failed: " : ""}
                    {outreach.error === "invalid_email_removed"
                      ? "That address isn't a real email (needs name@example.com). We removed it from this lead."
                      : outreach.error.startsWith("verify_blocked:")
                        ? `Verifier isn't sure ${toEmail || "this address"} can receive mail (${outreach.error.slice("verify_blocked:".length)}). Soft checks false-positive often — you can send anyway if you trust it.`
                        : outreach.error}
                  </p>
                )}

                {!sent && registerOnly ? (
                  <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-mist-400">
                    No email on this lead — register contact channels above, or
                    add an address in Lead info to unlock Send.
                  </p>
                ) : null}

                {!sent && !registerOnly && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <Lockable>
                      <button
                        type="button"
                        onClick={() =>
                          run("save", async () => {
                            await props.onSaveDraft(outreach.id, {
                              subject,
                              body,
                              toEmail: toEmail || null,
                            });
                            setSavedDraft({ subject, body, toEmail });
                          })
                        }
                        disabled={busy === "save" || editLocked}
                        title={editLocked ? lockHint : undefined}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-50"
                      >
                        {busy === "save" ? <Spinner className="h-3.5 w-3.5" /> : null}
                        Save draft
                      </button>
                    </Lockable>
                    <Lockable>
                      <button
                        type="button"
                        onClick={() =>
                          void (async () => {
                            if (busy === "send" || editLocked) return;
                            try {
                              await persistIfDirty();
                            } catch {
                              return;
                            }
                            // Close immediately — progress lives on the studio toast.
                            onClose();
                            void props.onSend(outreach.id);
                          })()
                        }
                        disabled={!canSend || busy === "send" || editLocked}
                        title={
                          editLocked
                            ? lockHint
                            : !toEmail
                              ? "Add a recipient email first"
                              : undefined
                        }
                        className="inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-5 py-2 text-sm font-medium text-on-accent transition-transform hover:scale-105 disabled:opacity-50"
                      >
                      <ArrowIcon className="h-4 w-4" />
                      {capabilities.canSendEmail ? "Send email" : "Send (simulate)"}
                    </button>
                    </Lockable>
                  </div>
                )}

                {!capabilities.canSendEmail && !sent && !registerOnly && (
                  <p className="text-xs text-mist-500">
                    No email provider configured — sending is simulated and won&apos;t
                    actually deliver. Add a Resend or SMTP key in Settings.
                  </p>
                )}
              </div>
            )}
          </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

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

function AutoGrowAbout({
  defaultValue,
  onSave,
  disabled = false,
  lockHint,
}: {
  defaultValue: string;
  onSave: (raw: string) => void;
  disabled?: boolean;
  lockHint?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 36)}px`;
  };

  useEffect(() => {
    resize();
  }, [defaultValue]);

  return (
    <Lockable className="flex w-full">
    <div className="flex w-full items-start gap-2 rounded-lg border border-white/10 bg-ink-950/40 px-2.5 py-1.5 focus-within:border-aurora-400/50">
      <textarea
        ref={ref}
        defaultValue={defaultValue}
        rows={1}
        onInput={resize}
        onBlur={(e) => {
          if (disabled) return;
          onSave(e.target.value);
        }}
        placeholder="Short blurb about this lead…"
        aria-label={disabled && lockHint ? lockHint : "About"}
        disabled={disabled}
        title={disabled ? lockHint : undefined}
        className="min-h-[1.5rem] min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-0.5 text-sm leading-relaxed text-mist-100 outline-none placeholder:text-mist-500 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
    </Lockable>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-mist-500">
      {children}
    </h4>
  );
}

function FieldMini({ label, children }: { label: string; children: React.ReactNode }) {
  // Div, not <label>: wrapping PitchEditor in a label makes clicks activate the
  // first toolbar button (Bold) instead of placing the caret in the body.
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-mist-500">{label}</span>
      {children}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactMethod, CrmStage, DeliveryStatus, FollowUp, LeadWithOutreach } from "@/lib/types";
import type { Capabilities } from "@/lib/config";
import { CrmStagePill, FitMeter, Spinner } from "@/components/ui";
import {
  ArrowIcon,
  CheckIcon,
  BuildingIcon,
  GlobeIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PinIcon,
  SparkIcon,
  XIcon,
} from "@/components/icons";
import { newId } from "@/lib/id";
import { displayWebsite, isUsableWebsite } from "@/lib/website";
import { normalizePitchHtml } from "@/lib/outreach/rich-text";
import { PitchEditor } from "@/components/studio/PitchEditor";
import { toggleContactMethod } from "@/lib/contact-methods";

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

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "1st March 2025" style for note journal lines. */
function formatNoteDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const ord =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = d.toLocaleString("en-GB", { month: "long" });
  return `${day}${ord} ${month} ${d.getFullYear()}`;
}

interface DrawerProps {
  lead: LeadWithOutreach;
  capabilities: Capabilities;
  /** info = CRM/profile only; draft = outreach composer only */
  mode?: "info" | "draft";
  /** Open the dated-note composer (today preselected) — phone contact flow. */
  promptNote?: boolean;
  onClose: () => void;
  onDraft: (leadId: string) => Promise<void | boolean | string | null>;
  onSaveDraft: (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
    opts?: { silent?: boolean },
  ) => Promise<void>;
  onDecide: (outreachId: string, decision: "approved" | "rejected") => Promise<void>;
  onSend: (outreachId: string) => Promise<void>;
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
    },
  ) => Promise<void>;
}

function parseList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize legacy fit-reason strings for display. */
function formatFitReason(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^imported from your file$/i.test(t)) return null;
  if (/^in target location\b/i.test(t)) return "In target location";
  return t;
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
];

// ─── Main drawer ──────────────────────────────────────────────────────────────

export function LeadDrawer(props: DrawerProps) {
  const { lead, capabilities, onClose } = props;
  const mode = props.mode ?? "info";
  const promptNote = props.promptNote ?? false;
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
  const [contactMethods, setContactMethods] = useState<ContactMethod[]>(
    lead.contactMethods ?? [],
  );
  const [followUps, setFollowUps] = useState<FollowUp[]>(lead.followUps ?? []);
  const [showAddNote, setShowAddNote] = useState(promptNote);
  const [newNoteDate, setNewNoteDate] = useState(todayIsoDate);
  const [newNoteText, setNewNoteText] = useState("");
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

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
    setCrmStage(lead.crmStage ?? "new");
    setContactMethods(lead.contactMethods ?? []);
    setFollowUps(lead.followUps ?? []);
    if (promptNote) {
      setShowAddNote(true);
      setNewNoteDate(todayIsoDate());
      setNewNoteText("");
    } else {
      setShowAddNote(false);
      setNewNoteDate(todayIsoDate());
      setNewNoteText("");
    }
  }, [lead.id, lead.crmStage, lead.contactMethods, lead.followUps, promptNote]);

  useEffect(() => {
    if (!promptNote || !showAddNote) return;
    const t = window.setTimeout(() => noteInputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [promptNote, showAddNote, lead.id]);

  const requestClose = () => {
    if (
      dirty &&
      !window.confirm(
        "You have unsaved email changes. Leave without saving?",
      )
    ) {
      return;
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, dirty, subject, body, toEmail]);

  /** Persist composer fields before approve/send so edits aren't lost. */
  const persistIfDirty = async () => {
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

  /** Toggle a contact method (multi-select). */
  const toggleMethod = async (method: ContactMethod) => {
    const next = toggleContactMethod(contactMethods, method);
    const stage =
      next.length > 0 && crmStage === "new" ? "contacted" : crmStage;
    await commitStage(stage, next);
  };

  const isPastNew =
    crmStage === "contacted" ||
    crmStage === "in_conversation" ||
    crmStage === "closed" ||
    crmStage === "not_interested";
  const needsMethod = isPastNew && contactMethods.length === 0;
  const outreachSent = outreach?.status === "sent";
  /** Pipeline/CRM contacted — log methods/notes, don't push email approve/send. */
  const registerOnly = isPastNew && !outreachSent;

  // ── Dated notes (journal) ──
  const addNote = async () => {
    const text = newNoteText.trim();
    if (!newNoteDate || !text) return;
    const fu: FollowUp = { id: newId("fu"), date: newNoteDate, note: text, done: false };
    const updated = [...followUps, fu];
    setFollowUps(updated);
    setShowAddNote(false);
    setNewNoteDate(todayIsoDate());
    setNewNoteText("");
    await props.onUpdateCrm(lead.id, { followUps: updated, notes: null });
  };

  const deleteFollowUp = async (fuId: string) => {
    const updated = followUps.filter((f) => f.id !== fuId);
    setFollowUps(updated);
    await props.onUpdateCrm(lead.id, { followUps: updated });
  };

  const canSend = outreach?.status === "approved" && !!toEmail;
  const sent = outreach?.status === "sent";

  return (
    // Above Leaflet panes/controls (marker ~600, control ~1000).
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={requestClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-drawer-title"
        className={`animate-float-up relative flex w-full flex-col overflow-hidden border border-white/10 bg-ink-900 shadow-2xl ${
          mode === "info"
            ? "max-h-[min(90dvh,720px)] max-w-[61rem] rounded-xl2"
            : "h-[min(92dvh,900px)] max-w-[56rem] rounded-xl2 sm:h-[min(90dvh,860px)]"
        }`}
      >

        {/* Header */}
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/5 bg-ink-900/90 p-6 backdrop-blur-xl">
          <div className="min-w-0 flex-1 pr-2">
            {mode === "info" ? (
              <div className="flex items-center gap-2">
                <CrmStagePill stage={lead.crmStage ?? "new"} />
                <FitMeter score={lead.fitScore} />
              </div>
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
              <div className={`min-w-0 ${mode === "info" ? "mt-3" : ""}`}>
                <input
                  id="lead-drawer-title"
                  key={`${lead.id}-company-${lead.company}`}
                  defaultValue={lead.company}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== lead.company) {
                      void props.onUpdateCrm(lead.id, { company: next });
                    }
                  }}
                  aria-label="Company name"
                  className="w-full min-w-0 rounded-md bg-transparent py-0.5 font-display text-xl font-semibold tracking-tight text-mist-100 outline-none placeholder:text-mist-500 focus:bg-ink-950/40 focus:underline focus:decoration-aurora-400/50 sm:text-2xl"
                />
              </div>
            )}
          </div>
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

        <div
          className={
            mode === "info"
              ? "grid min-h-0 flex-1 gap-0 overflow-hidden sm:grid-cols-[minmax(0,1.15fr)_minmax(14rem,0.85fr)]"
              : "min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6"
          }
        >
          {mode === "info" ? (
            <>
          <div className="min-h-0 space-y-6 overflow-y-auto p-6">
          {/* CRM Stage picker */}
          <section>
            <SectionLabel>Sales stage</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {CRM_STAGES.map(({ stage, label, color }) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => handleStageClick(stage)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-all ${
                    crmStage === stage
                      ? color
                      : "bg-white/5 text-mist-500 ring-white/10 hover:text-mist-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* How contacted — multi-select; amber when Contacted+ with none set */}
            {crmStage !== "new" && (
              <div
                className={`mt-3 rounded-xl px-3 py-2.5 ${
                  needsMethod
                    ? "border border-amber-400/40 bg-amber-400/10 ring-1 ring-amber-400/20"
                    : "border border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={`shrink-0 text-xs font-medium ${
                      needsMethod ? "text-amber-300" : "text-mist-400"
                    }`}
                  >
                    {needsMethod ? "How did you reach them?" : "Reached via"}
                  </p>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {CONTACT_METHODS.map(({ method, label }) => {
                      const on = contactMethods.includes(method);
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => void toggleMethod(method)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            on
                              ? needsMethod
                                ? "bg-amber-400 text-on-accent"
                                : "bg-aurora-400/20 text-aurora-200 ring-1 ring-aurora-400/40"
                              : needsMethod
                                ? "border border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                                : "border border-white/15 text-mist-400 hover:bg-white/5"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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
              onSave={(raw) => {
                const next = parseList(raw);
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
            <AutoGrowAbout
              key={`${lead.id}-about-${lead.aboutBlurb ?? ""}`}
              defaultValue={lead.aboutBlurb ?? ""}
              onSave={(raw) => {
                const next = raw.trim() || null;
                if (next !== (lead.aboutBlurb ?? null)) {
                  void props.onUpdateCrm(lead.id, { aboutBlurb: next });
                }
              }}
            />
          </section>

          {/* Fit score reasoning */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <SectionLabel>Why this fit score</SectionLabel>
              <div className="flex items-center gap-2">
                <span
                  className={`font-display text-2xl font-semibold tabular-nums leading-none ${
                    lead.fitScore >= 75
                      ? "text-aurora-300"
                      : lead.fitScore >= 55
                        ? "text-amber-300"
                        : "text-mist-400"
                  }`}
                >
                  {lead.fitScore}
                  <span className="text-sm font-normal text-mist-500">%</span>
                </span>
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {lead.fitReasons
                .map(formatFitReason)
                .filter((r): r is string => Boolean(r))
                .map((r) => (
                  <li key={r} className="flex items-start gap-2 text-sm text-mist-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-aurora-400" />
                    {r}
                  </li>
                ))}
            </ul>
          </section>
          </div>

          {/* Notes column — grows independently so the left profile stays readable */}
          <aside className="flex min-h-0 flex-col border-t border-white/5 bg-ink-950/40 sm:border-l sm:border-t-0">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
              <SectionLabel>Notes</SectionLabel>
              <button
                type="button"
                onClick={() => {
                  setShowAddNote(true);
                  setNewNoteDate(todayIsoDate());
                }}
                className="text-[11px] text-aurora-400 hover:underline"
              >
                + Add
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {lead.notes?.trim() && followUps.length === 0 && (
                <p className="text-sm leading-relaxed text-mist-400">
                  <span className="font-semibold text-mist-200">Earlier note:</span>{" "}
                  {lead.notes.trim()}
                </p>
              )}

              {showAddNote && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-ink-900/60 p-3">
                  <input
                    type="date"
                    value={newNoteDate}
                    onChange={(e) => setNewNoteDate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-sm text-mist-100 outline-none focus:border-aurora-400/60"
                  />
                  <textarea
                    ref={noteInputRef}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    rows={3}
                    placeholder="What happened…"
                    className="w-full resize-y rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-sm text-mist-100 outline-none placeholder:text-mist-600 focus:border-aurora-400/60"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void addNote()}
                      disabled={!newNoteDate || !newNoteText.trim()}
                      className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddNote(false);
                        setNewNoteText("");
                        setNewNoteDate(todayIsoDate());
                      }}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-500 hover:text-mist-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {followUps.length === 0 && !showAddNote ? (
                <p className="text-xs text-mist-600">
                  No notes yet. Add a dated entry (defaults to today).
                </p>
              ) : (
                <ul className="space-y-2">
                  {[...followUps]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((fu) => (
                      <li key={fu.id} className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 text-sm leading-relaxed text-mist-300">
                          <span className="font-semibold text-mist-100">
                            {formatNoteDate(fu.date)}:
                          </span>{" "}
                          {fu.note || "—"}
                        </p>
                        <button
                          type="button"
                          onClick={() => void deleteFollowUp(fu.id)}
                          className="mt-0.5 text-mist-600 hover:text-rose-400"
                          aria-label="Delete note"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </aside>
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
                <button
                  onClick={() =>
                    run("draft", async () => {
                      await props.onDraft(lead.id);
                    })
                  }
                  disabled={busy === "draft"}
                  title="Rewrite this draft"
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs text-mist-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                >
                  {busy === "draft" ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3.5 w-3.5" />}
                  Regenerate
                </button>
              ) : null}
            </div>

            {registerOnly && !outreach ? (
              <div className="space-y-3">
                <p className="text-sm text-mist-300">
                  This lead is already contacted in the pipeline. Log how you
                  reached them below — no email draft, approve, or send.
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
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CONTACT_METHODS.map(({ method, label }) => {
                      const on = contactMethods.includes(method);
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => void toggleMethod(method)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            on
                              ? "bg-aurora-400/20 text-aurora-200 ring-1 ring-aurora-400/40"
                              : "border border-white/15 text-mist-400 hover:bg-white/5"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-mist-500">
                  Use Lead info (i) to add dated notes anytime.
                </p>
              </div>
            ) : !outreach ? (
              <div className="text-center">
                <p className="text-sm text-mist-300">
                  No draft yet. Generate a personalized first email for this lead.
                </p>
                <button
                  onClick={() =>
                    run("draft", async () => {
                      await props.onDraft(lead.id);
                    })
                  }
                  disabled={busy === "draft"}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-105 disabled:opacity-50"
                >
                  {busy === "draft" ? <Spinner className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}
                  Draft outreach
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <FieldMini label="To">
                  <input
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    disabled={sent}
                    placeholder="name@company.com"
                    className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-aurora-400/60 disabled:opacity-60"
                  />
                </FieldMini>
                <FieldMini label="Subject">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={sent}
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
                    <PitchEditor
                      value={body}
                      onChange={(html) => setBody(html)}
                      placeholder="Email body…"
                    />
                  )}
                </FieldMini>

                {sent ? (
                  <div className="space-y-4 pt-1">
                    <div className="animate-sent-pop flex flex-col items-center gap-2 rounded-xl2 border border-aurora-400/25 bg-gradient-to-b from-aurora-400/15 to-transparent px-4 py-5 text-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-aurora-400 text-on-accent shadow-[0_0_28px_-4px_rgba(67,224,168,0.65)]">
                        <CheckIcon className="h-6 w-6" />
                      </span>
                      <p className="font-display text-lg font-semibold text-aurora-200">
                        Sent
                      </p>
                      {outreach.sentAt ? (
                        <p className="text-xs text-mist-400">
                          {new Date(outreach.sentAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-mist-500">
                        Delivery outcome
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {(
                          [
                            { id: "sent", label: "Delivered" },
                            { id: "bounced", label: "Bounced" },
                          ] as const
                        ).map((opt) => {
                          const active = (outreach.deliveryStatus ?? "unknown") === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={busy === "delivery"}
                              onClick={() =>
                                run("delivery", () =>
                                  props.onSetDelivery(outreach.id, opt.id),
                                )
                              }
                              className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                                active
                                  ? opt.id === "bounced"
                                    ? "bg-rose-500/15 text-rose-300 ring-rose-400/30"
                                    : "bg-aurora-400/15 text-aurora-300 ring-aurora-400/30"
                                  : "text-mist-400 ring-white/10 hover:bg-white/5 hover:text-mist-100"
                              }`}
                            >
                              {opt.label}
                            </button>
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
                      ? "That address couldn't receive mail — we removed it from this lead."
                      : outreach.error}
                  </p>
                )}

                {!sent && registerOnly ? (
                  <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-mist-400">
                    Pipeline already marks this lead as contacted — use the
                    channels above to register how you reached them. Approve /
                    send stay available only for New → Ready email flow.
                  </p>
                ) : null}

                {!sent && !registerOnly && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
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
                      disabled={busy === "save"}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-50"
                    >
                      {busy === "save" ? <Spinner className="h-3.5 w-3.5" /> : null}
                      Save draft
                    </button>
                    {outreach.status !== "approved" ? (
                      <button
                        onClick={() =>
                          run("approve", async () => {
                            await persistIfDirty();
                            await props.onDecide(outreach.id, "approved");
                          })
                        }
                        disabled={busy === "approve"}
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-5 py-2 text-sm font-medium text-on-accent transition-transform hover:scale-105 disabled:opacity-50"
                      >
                        {busy === "approve" ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <CheckIcon className="h-4 w-4" />
                        )}
                        Approve
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          run("send", async () => {
                            await persistIfDirty();
                            await props.onSend(outreach.id);
                          })
                        }
                        disabled={!canSend || busy === "send"}
                        title={!toEmail ? "Add a recipient email first" : undefined}
                        className="inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-5 py-2 text-sm font-medium text-on-accent transition-transform hover:scale-105 disabled:opacity-50"
                      >
                        {busy === "send" ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowIcon className="h-4 w-4" />
                        )}
                        {busy === "send"
                          ? capabilities.emailVerify
                            ? "Verifying email…"
                            : "Sending…"
                          : capabilities.canSendEmail
                            ? "Send email"
                            : "Send (simulate)"}
                      </button>
                    )}
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
}: {
  icon: React.ReactNode;
  label: string;
  defaultValue: string;
  fieldKey: string;
  placeholder: string;
  onSave: (raw: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-sm text-mist-100">
      <span className="shrink-0 text-mist-500" aria-hidden>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/10 bg-ink-950/40 px-2.5 py-1.5 focus-within:border-aurora-400/50">
        <input
          key={fieldKey}
          defaultValue={defaultValue}
          onBlur={(e) => onSave(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-sm text-mist-100 outline-none placeholder:text-mist-500"
        />
        <PencilIcon className="h-3.5 w-3.5 shrink-0 text-mist-500" aria-hidden />
      </div>
    </div>
  );
}

function AutoGrowAbout({
  defaultValue,
  onSave,
}: {
  defaultValue: string;
  onSave: (raw: string) => void;
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
    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-ink-950/40 px-2.5 py-1.5 focus-within:border-aurora-400/50">
      <textarea
        ref={ref}
        defaultValue={defaultValue}
        rows={1}
        onInput={resize}
        onBlur={(e) => onSave(e.target.value)}
        placeholder="Short blurb about this lead…"
        aria-label="About"
        className="min-h-[1.5rem] min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-0.5 text-sm leading-relaxed text-mist-100 outline-none placeholder:text-mist-500"
      />
      <PencilIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-mist-500" aria-hidden />
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

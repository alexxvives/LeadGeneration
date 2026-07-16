"use client";

import { useEffect, useState } from "react";
import type { ContactMethod, CrmStage, DeliveryStatus, FollowUp, LeadWithOutreach } from "@/lib/types";
import type { Capabilities } from "@/lib/config";
import { CrmStagePill, FitMeter, Spinner } from "@/components/ui";
import {
  ArrowIcon,
  CheckIcon,
  GlobeIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
  SparkIcon,
  XIcon,
} from "@/components/icons";
import { newId } from "@/lib/id";
import { displayWebsite, isUsableWebsite } from "@/lib/website";
import { normalizePitchHtml } from "@/lib/outreach/rich-text";
import { PitchEditor } from "@/components/studio/PitchEditor";

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
  onClose: () => void;
  onDraft: (leadId: string) => Promise<void>;
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
      contactMethod?: ContactMethod | null;
      notes?: string | null;
      followUps?: FollowUp[];
    },
  ) => Promise<void>;
}

// ─── CRM stage config ─────────────────────────────────────────────────────────

const CRM_STAGES: { stage: CrmStage; label: string; color: string }[] = [
  { stage: "new",             label: "New",             color: "bg-mist-500/20 text-mist-300 ring-mist-500/20" },
  { stage: "contacted",       label: "Contacted",       color: "bg-amber-400/15 text-amber-300 ring-amber-400/20" },
  { stage: "in_conversation", label: "In Conversation", color: "bg-sky-400/15 text-sky-300 ring-sky-400/25" },
  { stage: "closed",          label: "Closed",          color: "bg-aurora-300/20 text-aurora-200 ring-aurora-300/25" },
  { stage: "not_interested",  label: "Not Interested",  color: "bg-rose-500/10 text-rose-300 ring-rose-500/20" },
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
  const outreach = lead.outreach;

  const [subject, setSubject] = useState(outreach?.subject ?? "");
  const [body, setBody] = useState(outreach?.body ?? "");
  const [toEmail, setToEmail] = useState(outreach?.toEmail ?? lead.emails[0] ?? "");
  const [busy, setBusy] = useState<null | string>(null);
  const [dirty, setDirty] = useState(false);

  // CRM state (local, synced on changes)
  const [crmStage, setCrmStage] = useState<CrmStage>(lead.crmStage ?? "new");
  const [contactMethod, setContactMethod] = useState<ContactMethod | null>(lead.contactMethod ?? null);
  const [followUps, setFollowUps] = useState<FollowUp[]>(lead.followUps ?? []);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteDate, setNewNoteDate] = useState(todayIsoDate);
  const [newNoteText, setNewNoteText] = useState("");

  // Reset all fields when the lead changes.
  useEffect(() => {
    setSubject(outreach?.subject ?? "");
    setBody(outreach?.body ?? "");
    setToEmail(outreach?.toEmail ?? lead.emails[0] ?? "");
    setDirty(false);
    setCrmStage(lead.crmStage ?? "new");
    setContactMethod(lead.contactMethod ?? null);
    setFollowUps(lead.followUps ?? []);
    setShowAddNote(false);
    setNewNoteDate(todayIsoDate());
    setNewNoteText("");
  }, [lead.id, lead.crmStage, lead.contactMethod, lead.followUps,
      outreach?.id, outreach?.subject, outreach?.body, outreach?.toEmail, lead.emails]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Persist composer fields before approve/send so edits aren't lost. */
  const persistIfDirty = async () => {
    if (!outreach || !dirty) return;
    await props.onSaveDraft(
      outreach.id,
      { subject, body, toEmail: toEmail || null },
      { silent: true },
    );
    setDirty(false);
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };

  // ── CRM stage change ──
  const handleStageClick = (stage: CrmStage) => {
    const emailed =
      crmStage === "contacted" ||
      lead.status === "sent" ||
      outreach?.status === "sent" ||
      contactMethod === "email";
    if (stage === "new" && emailed && crmStage !== "new") {
      const ok = window.confirm(
        `${lead.company} already has outreach history. Move back to New anyway? (Does not unsend the email.)`,
      );
      if (!ok) return;
    }
    // Moving to New clears method; Contacted no longer forces a method popup.
    const nextMethod = stage === "new" ? null : contactMethod;
    void commitStage(stage, nextMethod);
  };

  const commitStage = async (stage: CrmStage, method: ContactMethod | null) => {
    setCrmStage(stage);
    setContactMethod(method);
    await props.onUpdateCrm(lead.id, { crmStage: stage, contactMethod: method });
  };

  /** Set contact method for a lead already in Contacted. */
  const commitContactMethod = async (method: ContactMethod) => {
    await commitStage(crmStage === "new" ? "contacted" : crmStage, method);
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onClose} />
      <aside
        className={`animate-float-up relative flex w-full flex-col overflow-hidden border border-white/10 bg-ink-900 shadow-2xl ${
          mode === "info"
            ? "max-h-[min(90dvh,720px)] max-w-[61rem] rounded-xl2"
            : "h-[min(92dvh,900px)] max-w-[43rem] rounded-xl2 sm:h-[min(90dvh,860px)]"
        }`}
      >

        {/* Header */}
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-white/5 bg-ink-900/90 p-6 backdrop-blur-xl">
          <div className="min-w-0">
            {mode === "info" ? (
              <div className="flex items-center gap-2">
                <CrmStagePill stage={lead.crmStage ?? "new"} />
                <FitMeter score={lead.fitScore} />
              </div>
            ) : null}
            <h2
              className={`truncate font-display text-2xl font-semibold ${
                mode === "info" ? "mt-2" : ""
              }`}
            >
              {mode === "draft" ? "Draft" : lead.company}
            </h2>
            {mode === "draft" ? (
              <p className="mt-1 truncate text-sm text-mist-500">{lead.company}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
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

            {/* Optional method when already Contacted without one set */}
            {crmStage === "contacted" && !contactMethod && (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-xs font-medium text-amber-300">How did you reach them?</p>
                  {CONTACT_METHODS.map(({ method, label }) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => void commitContactMethod(method)}
                      className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-400/20"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {contactMethod && crmStage !== "new" && (
              <p className="mt-1.5 text-[11px] text-mist-500">
                Reached by{" "}
                <span className="text-mist-300">{contactMethod.replace("_", " ")}</span>
              </p>
            )}
          </section>

          {/* Contact info */}
          <section className="grid gap-3">
            {isUsableWebsite(lead.website) && (
              <InfoRow icon={<GlobeIcon className="h-4 w-4" />}>
                <a href={lead.website!} target="_blank" rel="noreferrer" className="text-aurora-300 hover:underline">
                  {displayWebsite(lead.website)}
                </a>
              </InfoRow>
            )}
            <InfoRow icon={<MailIcon className="h-4 w-4" />}>
              {lead.emails.length ? (
                lead.emails.join(", ")
              ) : (
                <span className="text-mist-500">No email discovered — add one in Outreach → Edit.</span>
              )}
            </InfoRow>
            {lead.phones.length > 0 && (
              <InfoRow icon={<PhoneIcon className="h-4 w-4" />}>{lead.phones.join(", ")}</InfoRow>
            )}
            {lead.location && (
              <InfoRow icon={<PinIcon className="h-4 w-4" />}>{lead.location}</InfoRow>
            )}
          </section>

          {/* About */}
          {lead.aboutBlurb && (
            <section>
              <SectionLabel>About</SectionLabel>
              <p className="text-sm leading-relaxed text-mist-300">{lead.aboutBlurb}</p>
            </section>
          )}

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
            <ul className="grid gap-1.5">
              {lead.fitReasons.map((r) => (
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
                      className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-ink-950 disabled:opacity-40"
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
          {/* Draft-only composer — flat; popup shell already provides the surface */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Email</h3>
              {outreach && !sent ? (
                <button
                  onClick={() => run("draft", () => props.onDraft(lead.id))}
                  disabled={busy === "draft"}
                  title="Rewrite this draft"
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs text-mist-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                >
                  {busy === "draft" ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3.5 w-3.5" />}
                  Regenerate
                </button>
              ) : null}
            </div>

            {!outreach ? (
              <div className="text-center">
                <p className="text-sm text-mist-300">
                  No draft yet. Generate a personalized first email for this lead.
                </p>
                <button
                  onClick={() => run("draft", () => props.onDraft(lead.id))}
                  disabled={busy === "draft"}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
                >
                  {busy === "draft" ? <Spinner className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}
                  Draft outreach
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sent ? (
                  <div className="space-y-4">
                    <div className="animate-sent-pop flex flex-col items-center gap-2 rounded-xl2 border border-aurora-400/25 bg-gradient-to-b from-aurora-400/15 to-transparent px-4 py-5 text-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-aurora-400 text-ink-950 shadow-[0_0_28px_-4px_rgba(67,224,168,0.65)]">
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
                            { id: "replied", label: "Replied" },
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
                                    : opt.id === "replied"
                                      ? "bg-sky-400/15 text-sky-300 ring-sky-400/30"
                                      : "bg-aurora-400/15 text-aurora-300 ring-aurora-400/30"
                                  : "text-mist-400 ring-white/10 hover:bg-white/5 hover:text-mist-100"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-center text-[11px] text-mist-600">
                        Updates automatically via Maileroo/Resend webhooks. You can
                        still correct it here.
                      </p>
                    </div>
                  </div>
                ) : null}

                <FieldMini label="To">
                  <input
                    value={toEmail}
                    onChange={(e) => { setToEmail(e.target.value); setDirty(true); }}
                    disabled={sent}
                    placeholder="name@company.com"
                    className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-aurora-400/60 disabled:opacity-60"
                  />
                </FieldMini>
                <FieldMini label="Subject">
                  <input
                    value={subject}
                    onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
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
                      onChange={(html) => {
                        setBody(html);
                        setDirty(true);
                      }}
                      placeholder="Email body…"
                    />
                  )}
                </FieldMini>

                {outreach.error && (
                  <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {outreach.status === "failed" ? "Send failed: " : ""}
                    {outreach.error}
                  </p>
                )}

                {!sent && (
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
                          setDirty(false);
                        })
                      }
                      disabled={!dirty || busy === "save"}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-mist-200 transition-colors hover:bg-white/5 disabled:opacity-40"
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
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-5 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
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
                        className="inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-5 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
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

                {!sent && busy === "send" && capabilities.emailVerify ? (
                  <p className="text-center text-xs text-amber-200/80">
                    Checking that this address is real before we send.
                  </p>
                ) : null}

                {!capabilities.canSendEmail && !sent && (
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

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm text-mist-100">
      <span className="text-mist-500">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
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
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-mist-500">{label}</span>
      {children}
    </label>
  );
}

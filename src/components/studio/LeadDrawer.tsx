"use client";

import { useEffect, useState } from "react";
import type { ContactMethod, CrmStage, DeliveryStatus, FollowUp, LeadWithOutreach } from "@/lib/types";
import type { Capabilities } from "@/lib/config";
import { FitMeter, Spinner, StatusPill } from "@/components/ui";
import {
  ArrowIcon,
  CheckIcon,
  GlobeIcon,
  MailIcon,
  PhoneIcon,
  SparkIcon,
  XIcon,
} from "@/components/icons";
import { newId } from "@/lib/id";

interface DrawerProps {
  lead: LeadWithOutreach;
  capabilities: Capabilities;
  onClose: () => void;
  onDraft: (leadId: string) => Promise<void>;
  onSaveDraft: (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
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
  const outreach = lead.outreach;

  const [subject, setSubject] = useState(outreach?.subject ?? "");
  const [body, setBody] = useState(outreach?.body ?? "");
  const [toEmail, setToEmail] = useState(outreach?.toEmail ?? lead.emails[0] ?? "");
  const [busy, setBusy] = useState<null | string>(null);
  const [dirty, setDirty] = useState(false);

  // CRM state (local, synced on changes)
  const [crmStage, setCrmStage] = useState<CrmStage>(lead.crmStage ?? "new");
  const [contactMethod, setContactMethod] = useState<ContactMethod | null>(lead.contactMethod ?? null);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [pendingStage, setPendingStage] = useState<CrmStage | null>(null);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [followUps, setFollowUps] = useState<FollowUp[]>(lead.followUps ?? []);
  const [showAddFollowUp, setShowAddFollowUp] = useState(false);
  const [newFollowUpDate, setNewFollowUpDate] = useState("");
  const [newFollowUpNote, setNewFollowUpNote] = useState("");

  // Reset all fields when the lead changes.
  useEffect(() => {
    setSubject(outreach?.subject ?? "");
    setBody(outreach?.body ?? "");
    setToEmail(outreach?.toEmail ?? lead.emails[0] ?? "");
    setDirty(false);
    setCrmStage(lead.crmStage ?? "new");
    setContactMethod(lead.contactMethod ?? null);
    setNotes(lead.notes ?? "");
    setFollowUps(lead.followUps ?? []);
    setShowMethodPicker(false);
    setPendingStage(null);
  }, [lead.id, lead.crmStage, lead.contactMethod, lead.notes, lead.followUps,
      outreach?.id, outreach?.subject, outreach?.body, outreach?.toEmail, lead.emails]);

  // Keyboard shortcuts — skip when focus is in an input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "a" || e.key === "A") {
        if (outreach && outreach.status !== "approved" && outreach.status !== "sent") {
          void run("approve", () => props.onDecide(outreach.id, "approved"));
        }
      }
      if (e.key === "r" || e.key === "R") {
        if (outreach && outreach.status !== "sent") {
          void run("reject", () => props.onDecide(outreach.id, "rejected"));
        }
      }
      if (e.key === "g" || e.key === "G") {
        void run("draft", () => props.onDraft(lead.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, outreach, lead.id, props]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };

  // ── CRM stage change ──
  const handleStageClick = (stage: CrmStage) => {
    if (stage === "contacted" && crmStage !== "contacted") {
      // Show contact-method picker before committing.
      setPendingStage(stage);
      setShowMethodPicker(true);
    } else {
      commitStage(stage, contactMethod);
    }
  };

  const commitStage = async (stage: CrmStage, method: ContactMethod | null) => {
    setCrmStage(stage);
    setContactMethod(method);
    setShowMethodPicker(false);
    setPendingStage(null);
    await props.onUpdateCrm(lead.id, { crmStage: stage, contactMethod: method });
  };

  // ── Notes auto-save on blur ──
  const saveNotes = async () => {
    const trimmed = notes.trim() || null;
    if (trimmed === (lead.notes?.trim() || null)) return;
    await props.onUpdateCrm(lead.id, { notes: trimmed });
  };

  // ── Follow-ups ──
  const addFollowUp = async () => {
    if (!newFollowUpDate) return;
    const fu: FollowUp = { id: newId("fu"), date: newFollowUpDate, note: newFollowUpNote, done: false };
    const updated = [...followUps, fu];
    setFollowUps(updated);
    setShowAddFollowUp(false);
    setNewFollowUpDate("");
    setNewFollowUpNote("");
    await props.onUpdateCrm(lead.id, { followUps: updated });
  };

  const toggleFollowUpDone = async (fuId: string) => {
    const updated = followUps.map((f) => f.id === fuId ? { ...f, done: !f.done } : f);
    setFollowUps(updated);
    await props.onUpdateCrm(lead.id, { followUps: updated });
  };

  const deleteFollowUp = async (fuId: string) => {
    const updated = followUps.filter((f) => f.id !== fuId);
    setFollowUps(updated);
    await props.onUpdateCrm(lead.id, { followUps: updated });
  };

  const canSend = outreach?.status === "approved" && !!toEmail;
  const sent = outreach?.status === "sent";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onClose} />
      <aside className="animate-float-up relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-white/10 bg-ink-900 shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/5 bg-ink-900/90 p-6 backdrop-blur-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusPill status={lead.status} />
              <FitMeter score={lead.fitScore} />
            </div>
            <h2 className="mt-2 truncate font-display text-2xl font-semibold">{lead.company}</h2>
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

        <div className="space-y-6 p-6">

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

            {/* Contact method picker — shown when moving to Contacted */}
            {showMethodPicker && (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                <p className="mb-2 text-xs font-medium text-amber-300">How did you reach them?</p>
                <div className="flex flex-wrap gap-2">
                  {CONTACT_METHODS.map(({ method, label }) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => commitStage(pendingStage!, method)}
                      className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-400/20"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setShowMethodPicker(false); setPendingStage(null); }}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-500 transition-colors hover:text-mist-300"
                  >
                    Cancel
                  </button>
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
            {lead.website && (
              <InfoRow icon={<GlobeIcon className="h-4 w-4" />}>
                <a href={lead.website} target="_blank" rel="noreferrer" className="text-aurora-300 hover:underline">
                  {lead.website.replace(/^https?:\/\//, "")}
                </a>
              </InfoRow>
            )}
            <InfoRow icon={<MailIcon className="h-4 w-4" />}>
              {lead.emails.length ? (
                lead.emails.join(", ")
              ) : (
                <span className="text-mist-500">No email discovered — add one below to send.</span>
              )}
            </InfoRow>
            {lead.phones.length > 0 && (
              <InfoRow icon={<PhoneIcon className="h-4 w-4" />}>{lead.phones.join(", ")}</InfoRow>
            )}
          </section>

          {/* About */}
          {lead.aboutBlurb && (
            <section>
              <SectionLabel>About</SectionLabel>
              <p className="text-sm leading-relaxed text-mist-300">{lead.aboutBlurb}</p>
            </section>
          )}

          {/* Notes */}
          <section>
            <SectionLabel>Notes</SectionLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Spoke to Sarah, she mentioned Q4 budget review…"
              className="w-full resize-y rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2.5 font-sans text-sm leading-relaxed text-mist-100 outline-none placeholder:text-mist-600 transition-colors focus:border-aurora-400/60"
            />
          </section>

          {/* Follow-ups */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Follow-ups</SectionLabel>
              <button
                type="button"
                onClick={() => setShowAddFollowUp(true)}
                className="text-[11px] text-aurora-400 hover:underline"
              >
                + Add
              </button>
            </div>

            {showAddFollowUp && (
              <div className="mb-3 rounded-xl border border-white/10 bg-ink-850/60 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={newFollowUpDate}
                    onChange={(e) => setNewFollowUpDate(e.target.value)}
                    className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-mist-100 outline-none focus:border-aurora-400/60"
                  />
                  <input
                    type="text"
                    value={newFollowUpNote}
                    onChange={(e) => setNewFollowUpNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-mist-100 outline-none placeholder:text-mist-600 focus:border-aurora-400/60"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addFollowUp}
                    disabled={!newFollowUpDate}
                    className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-ink-950 disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddFollowUp(false); setNewFollowUpDate(""); setNewFollowUpNote(""); }}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-500 hover:text-mist-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {followUps.length === 0 && !showAddFollowUp ? (
              <p className="text-xs text-mist-600">No follow-ups yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {[...followUps].sort((a, b) => a.date.localeCompare(b.date)).map((fu) => (
                  <li key={fu.id} className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFollowUpDone(fu.id)}
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors ${
                        fu.done
                          ? "border-aurora-400/60 bg-aurora-400/20 text-aurora-300"
                          : "border-white/20 bg-ink-900"
                      } flex items-center justify-center`}
                      aria-label={fu.done ? "Mark not done" : "Mark done"}
                    >
                      {fu.done && <CheckIcon className="h-2.5 w-2.5" />}
                    </button>
                    <div className={`min-w-0 flex-1 ${fu.done ? "opacity-50 line-through" : ""}`}>
                      <span className="text-xs font-medium text-mist-300">{fu.date}</span>
                      {fu.note && <span className="ml-2 text-xs text-mist-500">{fu.note}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteFollowUp(fu.id)}
                      className="mt-0.5 text-mist-600 hover:text-rose-400"
                      aria-label="Delete follow-up"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
            <ul className="space-y-1.5">
              {lead.fitReasons.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm text-mist-300">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-aurora-400" />
                  {r}
                </li>
              ))}
            </ul>
            <a
              href={lead.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-mist-500 hover:text-mist-300"
            >
              Source: {truncate(lead.sourceUrl, 48)}
            </a>
          </section>

          {/* Outreach composer */}
          <section className="rounded-xl2 border border-white/10 bg-ink-850/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Outreach</h3>
              <div className="flex items-center gap-2">
                {outreach && !sent && (
                  <button
                    onClick={() => run("draft", () => props.onDraft(lead.id))}
                    disabled={busy === "draft"}
                    title="Rewrite this draft (G)"
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs text-mist-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                  >
                    {busy === "draft" ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3.5 w-3.5" />}
                    Regenerate
                  </button>
                )}
                {outreach && <StatusPill status={outreach.status} />}
              </div>
            </div>

            {!outreach ? (
              <div className="text-center">
                <p className="text-sm text-mist-300">
                  No draft yet. Generate a personalized first email for this lead.
                </p>
                <button
                  onClick={() => run("draft", () => props.onDraft(lead.id))}
                  disabled={busy === "draft"}
                  title="G"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
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
                  <textarea
                    value={body}
                    onChange={(e) => { setBody(e.target.value); setDirty(true); }}
                    disabled={sent}
                    rows={12}
                    className="w-full resize-y rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 font-sans text-sm leading-relaxed outline-none focus:border-aurora-400/60 disabled:opacity-60"
                  />
                </FieldMini>

                {outreach.status === "failed" && outreach.error && (
                  <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    Send failed: {outreach.error}
                  </p>
                )}

                {!sent && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() =>
                        run("save", () =>
                          props.onSaveDraft(outreach.id, { subject, body, toEmail: toEmail || null }),
                        ).then(() => setDirty(false))
                      }
                      disabled={!dirty || busy === "save"}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-40"
                    >
                      {busy === "save" ? <Spinner className="h-3.5 w-3.5" /> : null}
                      Save edits
                    </button>

                    <button
                      onClick={() => run("reject", () => props.onDecide(outreach.id, "rejected"))}
                      disabled={busy === "reject"}
                      title="R"
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-mist-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                    >
                      <XIcon className="h-4 w-4" /> Reject
                    </button>

                    {outreach.status !== "approved" ? (
                      <button
                        onClick={() => run("approve", () => props.onDecide(outreach.id, "approved"))}
                        disabled={busy === "approve"}
                        title="A"
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
                      >
                        {busy === "approve" ? <Spinner className="h-3.5 w-3.5" /> : <CheckIcon className="h-4 w-4" />}
                        Approve
                      </button>
                    ) : (
                      <button
                        onClick={() => run("send", () => props.onSend(outreach.id))}
                        disabled={!canSend || busy === "send"}
                        title={!toEmail ? "Add a recipient email first" : undefined}
                        className="inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-5 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
                      >
                        {busy === "send" ? <Spinner className="h-3.5 w-3.5" /> : <ArrowIcon className="h-4 w-4" />}
                        {capabilities.canSendEmail ? "Send email" : "Send (simulate)"}
                      </button>
                    )}
                  </div>
                )}

                {sent && (
                  <div className="space-y-3">
                    <p className="inline-flex items-center gap-2 rounded-lg bg-aurora-500/10 px-3 py-2 text-sm text-aurora-300">
                      <CheckIcon className="h-4 w-4" /> Sent
                      {outreach.sentAt ? ` · ${new Date(outreach.sentAt).toLocaleString()}` : ""}
                    </p>
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-mist-500">
                        Delivery outcome
                      </p>
                      <div className="flex flex-wrap gap-2">
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
                      <p className="mt-2 text-[11px] text-mist-600">
                        Manual stub for now — provider bounce/reply webhooks can write the same field later.
                      </p>
                    </div>
                  </div>
                )}

                {!capabilities.canSendEmail && !sent && (
                  <p className="text-xs text-mist-500">
                    No email provider configured — sending is simulated and won&apos;t
                    actually deliver. Add a Resend or SMTP key in Settings.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Keyboard shortcuts hint */}
          <p className="text-center text-[11px] text-mist-600">
            Shortcuts: <kbd className="rounded bg-white/5 px-1">G</kbd> generate ·{" "}
            <kbd className="rounded bg-white/5 px-1">A</kbd> approve ·{" "}
            <kbd className="rounded bg-white/5 px-1">R</kbd> reject ·{" "}
            <kbd className="rounded bg-white/5 px-1">Esc</kbd> close
          </p>
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

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

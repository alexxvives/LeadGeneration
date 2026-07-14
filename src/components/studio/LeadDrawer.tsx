"use client";

import { useEffect, useState } from "react";
import type { LeadWithOutreach } from "@/lib/types";
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
}

export function LeadDrawer(props: DrawerProps) {
  const { lead, capabilities, onClose } = props;
  const outreach = lead.outreach;

  const [subject, setSubject] = useState(outreach?.subject ?? "");
  const [body, setBody] = useState(outreach?.body ?? "");
  const [toEmail, setToEmail] = useState(outreach?.toEmail ?? lead.emails[0] ?? "");
  const [busy, setBusy] = useState<null | string>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSubject(outreach?.subject ?? "");
    setBody(outreach?.body ?? "");
    setToEmail(outreach?.toEmail ?? lead.emails[0] ?? "");
    setDirty(false);
  }, [outreach?.id, outreach?.subject, outreach?.body, outreach?.toEmail, lead.id, lead.emails]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const canSend = outreach?.status === "approved" && !!toEmail;
  const sent = outreach?.status === "sent";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="animate-float-up relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-white/10 bg-ink-900 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/5 bg-ink-900/90 p-6 backdrop-blur-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusPill status={lead.status} />
              <FitMeter score={lead.fitScore} />
            </div>
            <h2 className="mt-2 truncate font-display text-2xl font-semibold">
              {lead.company}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Contact + enrichment */}
          <section className="grid gap-3">
            {lead.website && (
              <InfoRow icon={<GlobeIcon className="h-4 w-4" />}>
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-aurora-300 hover:underline"
                >
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

          {lead.aboutBlurb && (
            <section>
              <SectionLabel>About</SectionLabel>
              <p className="text-sm leading-relaxed text-mist-300">{lead.aboutBlurb}</p>
            </section>
          )}

          {/* Fit reasoning — transparent scoring */}
          <section>
            <SectionLabel>Why this fit score</SectionLabel>
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
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs text-mist-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                    title="Rewrite this draft from scratch"
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
                    onChange={(e) => {
                      setToEmail(e.target.value);
                      setDirty(true);
                    }}
                    disabled={sent}
                    placeholder="name@company.com"
                    className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-aurora-400/60 disabled:opacity-60"
                  />
                </FieldMini>
                <FieldMini label="Subject">
                  <input
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value);
                      setDirty(true);
                    }}
                    disabled={sent}
                    className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-aurora-400/60 disabled:opacity-60"
                  />
                </FieldMini>
                <FieldMini label="Body">
                  <textarea
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      setDirty(true);
                    }}
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
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-mist-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                    >
                      <XIcon className="h-4 w-4" /> Reject
                    </button>

                    {outreach.status !== "approved" ? (
                      <button
                        onClick={() => run("approve", () => props.onDecide(outreach.id, "approved"))}
                        disabled={busy === "approve"}
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
                        {capabilities.canSendEmail ? "Send email" : "Send (demo)"}
                      </button>
                    )}
                  </div>
                )}

                {sent && (
                  <p className="inline-flex items-center gap-2 rounded-lg bg-aurora-500/10 px-3 py-2 text-sm text-aurora-300">
                    <CheckIcon className="h-4 w-4" /> Sent
                    {outreach.sentAt ? ` · ${new Date(outreach.sentAt).toLocaleString()}` : ""}
                  </p>
                )}

                {!capabilities.canSendEmail && !sent && (
                  <p className="text-xs text-mist-500">
                    No email provider configured — sending runs in demo mode and won&apos;t
                    actually deliver. Add a Resend or SMTP key in Settings.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

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

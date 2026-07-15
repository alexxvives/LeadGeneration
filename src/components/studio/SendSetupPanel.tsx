"use client";

import { useEffect, useState } from "react";
import { EmailSettingsForm, type EmailSettingsDefaults, type EmailSettingsValues } from "@/components/studio/EmailSettingsForm";
import { DomainHealthPanel } from "@/components/studio/DomainHealthChecklist";
import {
  loadWarmupProfile,
  saveWarmupProfile,
  recommendedDailySoftCap,
  todayKey,
  type MailboxAgeBand,
  type MailboxVolumeBand,
} from "@/lib/email/warmup";
import type { MailboxPublicStatus } from "@/lib/types";

type PathId = "easy" | "pro";

/**
 * Dual send-path framing: Easy (Resend) is the default wizard; Pro mailbox
 * connect (ADR 0010 — Google first; Microsoft coming).
 */
export function SendSetupPanel({
  initial,
  defaults,
  canEdit,
  canSendEmail,
  mailbox: mailboxInitial,
  defaultPath = "easy",
}: {
  initial: EmailSettingsValues;
  defaults: EmailSettingsDefaults;
  canEdit: boolean;
  canSendEmail: boolean;
  mailbox: MailboxPublicStatus;
  defaultPath?: PathId;
}) {
  const [path, setPath] = useState<PathId>(defaultPath);
  const [mailbox, setMailbox] = useState(mailboxInitial);
  const [ageBand, setAgeBand] = useState<MailboxAgeBand>(
    mailboxInitial.ageBand ?? "new",
  );
  const [volumeBand, setVolumeBand] = useState<MailboxVolumeBand>(
    mailboxInitial.volumeBand ?? "none",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMailbox(mailboxInitial);
    if (mailboxInitial.ageBand) setAgeBand(mailboxInitial.ageBand);
    if (mailboxInitial.volumeBand) setVolumeBand(mailboxInitial.volumeBand);
  }, [mailboxInitial]);

  // Sync self-report into client warmup soft-cap when connected.
  useEffect(() => {
    if (!mailbox.connected) return;
    const profile = loadWarmupProfile();
    saveWarmupProfile({
      ...profile,
      ageBand: mailbox.ageBand ?? ageBand,
      volumeBand: mailbox.volumeBand ?? volumeBand,
      startedOn: profile.startedOn || todayKey(),
    });
  }, [mailbox.connected, mailbox.ageBand, mailbox.volumeBand, ageBand, volumeBand]);

  const softCap = recommendedDailySoftCap({
    startedOn: todayKey(),
    ageBand,
    volumeBand,
    days: {},
  });

  async function disconnect() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mailbox", { method: "DELETE" });
      if (!res.ok) throw new Error("Disconnect failed");
      setMailbox({
        ...mailbox,
        connected: false,
        provider: null,
        email: null,
        connectedAt: null,
        ageBand: null,
        volumeBand: null,
      });
      setMsg("Mailbox disconnected. Easy (Resend) still works.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  function connectGoogle() {
    const params = new URLSearchParams({
      ageBand,
      volumeBand,
    });
    window.location.href = `/api/mailbox/google/start?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-mist-500">
            How do you want to send?
          </h2>
          <p className="text-sm text-mist-500">
            Pick a path. Easy uses Resend + your domain. Pro sends from your real Gmail
            mailbox after you approve each outreach.
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-full border border-white/10 bg-ink-900/60 p-1">
          <button
            type="button"
            onClick={() => setPath("easy")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              path === "easy"
                ? "bg-aurora-400 text-ink-950"
                : "text-mist-300 hover:text-mist-100"
            }`}
          >
            Easy — Resend
          </button>
          <button
            type="button"
            onClick={() => setPath("pro")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              path === "pro"
                ? "bg-aurora-400 text-ink-950"
                : "text-mist-300 hover:text-mist-100"
            }`}
          >
            Pro — mailbox
          </button>
        </div>
      </div>

      {path === "easy" ? (
        <div className="space-y-6">
          <ol className="space-y-3 text-sm text-mist-300">
            <li className="flex gap-3">
              <span className="font-display text-lg font-semibold text-aurora-300">1</span>
              <span>
                Create a free{" "}
                <a
                  href="https://resend.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-aurora-300 hover:underline"
                >
                  Resend
                </a>{" "}
                account and add your sending domain.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-lg font-semibold text-aurora-300">2</span>
              <span>
                Paste your From name, From email, and Resend API key below — then copy the DNS
                rows into your registrar (Hostinger, GoDaddy, Cloudflare, Namecheap, etc.).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-lg font-semibold text-aurora-300">3</span>
              <span>
                Watch domain health turn green. Approve each outreach in the studio before send
                {canSendEmail ? "" : " (without a key, sends stay simulated — demo-safe)"}.
              </span>
            </li>
          </ol>

          <div
            id="sending-identity"
            className="scroll-mt-8 rounded-xl2 border border-white/10 p-5"
            data-tour="sending-identity"
          >
            <h3 className="mb-4 text-sm font-semibold text-mist-100">Sending identity</h3>
            <EmailSettingsForm initial={initial} defaults={defaults} canEdit={canEdit} />
          </div>

          <DomainHealthPanel />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl2 border border-white/10 bg-ink-900/40 p-5">
            <p className="font-display text-xl font-semibold text-mist-100">
              Connect Google or Microsoft
            </p>
            <p className="mt-2 max-w-xl text-sm text-mist-300">
              Send approved outreach from your real Gmail or Outlook mailbox (better inbox
              placement for cold volume). Same human-approve step. Easy (Resend) stays available
              anytime.
            </p>
            <p className="mt-3 text-xs text-mist-500">
              Warmup: ramp slowly for free (soft daily suggest ~{softCap}/day from your answers
              below), or use a paid partner later — we won&apos;t run an in-house warmup network.
            </p>

            {mailbox.connected ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-aurora-400/30 bg-aurora-400/10 px-4 py-3 text-sm text-mist-100">
                  Connected ·{" "}
                  <span className="font-medium text-aurora-300">
                    {mailbox.provider === "google" ? "Google" : mailbox.provider} ·{" "}
                    {mailbox.email}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy || !canEdit}
                  onClick={() => void disconnect()}
                  className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-mist-200 transition-colors hover:border-white/30 hover:text-mist-50 disabled:opacity-50"
                >
                  {busy ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-mist-400">How old is this inbox?</span>
                    <select
                      value={ageBand}
                      onChange={(e) => setAgeBand(e.target.value as MailboxAgeBand)}
                      className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2.5 text-mist-100 outline-none focus:border-aurora-400/60"
                    >
                      <option value="new">Brand new (&lt; 2 weeks)</option>
                      <option value="weeks">A few weeks</option>
                      <option value="months">A few months</option>
                      <option value="established">Established (6+ months)</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-mist-400">Typical send volume?</span>
                    <select
                      value={volumeBand}
                      onChange={(e) => setVolumeBand(e.target.value as MailboxVolumeBand)}
                      className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2.5 text-mist-100 outline-none focus:border-aurora-400/60"
                    >
                      <option value="none">Almost none yet</option>
                      <option value="light">Light (a few / day)</option>
                      <option value="regular">Regular (dozens / day)</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!mailbox.googleReady || !canEdit}
                    onClick={connectGoogle}
                    className="inline-flex items-center rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                  >
                    Connect Google
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Microsoft Graph send ships after Google (ADR 0010)"
                    className="inline-flex items-center rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-mist-500 opacity-60"
                  >
                    Connect Microsoft — soon
                  </button>
                </div>

                {!mailbox.googleReady && (
                  <p className="text-xs text-amber-300/90">
                    Google OAuth is not configured on this server yet. Add{" "}
                    <code className="text-mist-300">GMAIL_OAUTH_CLIENT_ID</code> /{" "}
                    <code className="text-mist-300">GMAIL_OAUTH_CLIENT_SECRET</code> (see{" "}
                    <code className="text-mist-300">docs/gmail-oauth-setup.md</code>), then restart.
                  </p>
                )}
              </div>
            )}

            {msg && <p className="mt-3 text-sm text-mist-300">{msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

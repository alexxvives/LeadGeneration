"use client";

import { useEffect, useState } from "react";
import { CheckIcon, MailIcon } from "@/components/icons";
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

/** Single warmth choice → age/volume bands for soft daily recommend. */
type WarmthId = "new" | "warming" | "active";

const WARMTH: {
  id: WarmthId;
  label: string;
  hint: string;
  ageBand: MailboxAgeBand;
  volumeBand: MailboxVolumeBand;
}[] = [
  {
    id: "new",
    label: "New / cold",
    hint: "~15/day",
    ageBand: "new",
    volumeBand: "none",
  },
  {
    id: "warming",
    label: "A few months old",
    hint: "~40/day",
    ageBand: "months",
    volumeBand: "light",
  },
  {
    id: "active",
    label: "Established & active",
    hint: "~80/day",
    ageBand: "established",
    volumeBand: "regular",
  },
];

function warmthFromBands(
  age: MailboxAgeBand | null | undefined,
  volume: MailboxVolumeBand | null | undefined,
): WarmthId {
  if (age === "established" || volume === "regular") return "active";
  if (age === "months" || age === "weeks" || volume === "light") return "warming";
  return "new";
}

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
  const [warmth, setWarmth] = useState<WarmthId>(
    warmthFromBands(mailboxInitial.ageBand, mailboxInitial.volumeBand),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMailbox(mailboxInitial);
    setWarmth(warmthFromBands(mailboxInitial.ageBand, mailboxInitial.volumeBand));
  }, [mailboxInitial]);

  const warmthMeta = WARMTH.find((w) => w.id === warmth) ?? WARMTH[0];

  // Sync self-report into client warmup soft-cap when connected.
  useEffect(() => {
    if (!mailbox.connected) return;
    const profile = loadWarmupProfile();
    saveWarmupProfile({
      ...profile,
      ageBand: warmthMeta.ageBand,
      volumeBand: warmthMeta.volumeBand,
      startedOn: profile.startedOn || todayKey(),
    });
  }, [mailbox.connected, warmthMeta.ageBand, warmthMeta.volumeBand]);

  const softCap = recommendedDailySoftCap({
    startedOn: todayKey(),
    ageBand: warmthMeta.ageBand,
    volumeBand: warmthMeta.volumeBand,
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
      ageBand: warmthMeta.ageBand,
      volumeBand: warmthMeta.volumeBand,
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
            Easy = any domain via Resend (Zoho, Hostinger, Cloudflare DNS…). Pro = send
            through your real Google or Microsoft mailbox.
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
                rows into Cloudflare / GoDaddy / Hostinger (wherever DNS lives).
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
            <EmailSettingsForm
              initial={initial}
              defaults={defaults}
              canEdit={canEdit}
              variant="easy"
            />
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
              Pro sends through a <span className="text-mist-100">Gmail / Google Workspace</span>{" "}
              or <span className="text-mist-100">Outlook / Microsoft 365</span> mailbox — not
              Zoho, Hostinger mail, or generic SMTP. Those use Easy (Resend) with your domain
              DNS instead. Same human-approve step either way.
            </p>

            {mailbox.connected ? (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl2 border border-aurora-400/25 bg-gradient-to-br from-aurora-400/10 to-transparent px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-aurora-400/15 text-aurora-300">
                      <MailIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-mist-100">
                        <CheckIcon className="h-4 w-4 text-aurora-300" />
                        Connected
                        <span className="rounded-full border border-white/10 bg-ink-950/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-mist-400">
                          {mailbox.provider === "google" ? "Google" : mailbox.provider}
                        </span>
                      </p>
                      <p className="mt-1 truncate font-display text-lg text-aurora-300">
                        {mailbox.email}
                      </p>
                      <p className="mt-1 text-xs text-mist-500">
                        Soft warmup suggest ~{softCap}/day — warning only, never a hard block.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !canEdit}
                    onClick={() => void disconnect()}
                    className="shrink-0 rounded-full border border-white/12 bg-ink-950/50 px-4 py-2 text-sm font-medium text-mist-300 transition-colors hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-50"
                  >
                    {busy ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div>
                  <p className="mb-2 text-sm font-medium text-mist-100">
                    How warm is this inbox?
                  </p>
                  <p className="mb-3 text-xs text-mist-500">
                    Sets a soft daily suggest (you can still send more). No paid warmup network.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {WARMTH.map((w) => {
                      const on = warmth === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setWarmth(w.id)}
                          className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                            on
                              ? "border-aurora-400/50 bg-aurora-400/10 text-mist-100"
                              : "border-white/10 bg-ink-950/40 text-mist-300 hover:border-white/20 hover:text-mist-100"
                          }`}
                        >
                          <span className="block text-sm font-medium">{w.label}</span>
                          <span
                            className={`mt-0.5 block text-xs ${on ? "text-aurora-300" : "text-mist-500"}`}
                          >
                            Suggest {w.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!mailbox.googleReady || !canEdit}
                    onClick={connectGoogle}
                    className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                  >
                    <MailIcon className="h-4 w-4" />
                    Connect Google
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Microsoft Graph send ships after Google (ADR 0010)"
                    className="inline-flex items-center rounded-full border border-white/10 bg-ink-950/30 px-5 py-2.5 text-sm font-medium text-mist-500"
                  >
                    Connect Microsoft — soon
                  </button>
                </div>

                {!mailbox.googleReady && (
                  <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-xs text-amber-200/90">
                    Google OAuth is not configured on this server yet. Add{" "}
                    <code className="text-mist-300">GMAIL_OAUTH_CLIENT_ID</code> /{" "}
                    <code className="text-mist-300">GMAIL_OAUTH_CLIENT_SECRET</code>, then
                    restart.
                  </p>
                )}
              </div>
            )}

            {msg && <p className="mt-3 text-sm text-mist-300">{msg}</p>}
          </div>

          <div
            id="sending-identity-pro"
            className="scroll-mt-8 rounded-xl2 border border-white/10 p-5"
            data-tour="sending-identity"
          >
            <h3 className="mb-1 text-sm font-semibold text-mist-100">Sending identity</h3>
            <p className="mb-4 text-xs text-mist-500">
              Same compliance fields as Easy. From email comes from the connected mailbox when
              linked.
            </p>
            <EmailSettingsForm
              initial={initial}
              defaults={defaults}
              canEdit={canEdit}
              variant="pro"
              lockedFromEmail={mailbox.connected ? mailbox.email : null}
            />
          </div>
        </div>
      )}
    </div>
  );
}

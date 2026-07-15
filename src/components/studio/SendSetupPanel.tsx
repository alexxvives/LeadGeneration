"use client";

import { useEffect, useState } from "react";
import { CheckIcon, MailIcon } from "@/components/icons";
import {
  EmailSettingsForm,
  type EmailSettingsDefaults,
  type EmailSettingsValues,
} from "@/components/studio/EmailSettingsForm";
import { DomainHealthPanel } from "@/components/studio/DomainHealthChecklist";
import {
  loadWarmupProfile,
  saveWarmupProfile,
  recommendedDailySoftCap,
  todayKey,
  type MailboxAgeBand,
  type MailboxVolumeBand,
} from "@/lib/email/warmup";
import type { EasyEmailProvider, MailboxPublicStatus } from "@/lib/types";

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
 * Dual send-path framing: Easy (Resend or Maileroo) is the default wizard;
 * Pro mailbox connect (ADR 0010 — Google first; Microsoft coming).
 */
export function SendSetupPanel({
  initial,
  defaults,
  canEdit,
  canSendEmail,
  mailbox: mailboxInitial,
  defaultPath = "easy",
  appUrlLooksLocal = false,
}: {
  initial: EmailSettingsValues;
  defaults: EmailSettingsDefaults;
  canEdit: boolean;
  canSendEmail: boolean;
  mailbox: MailboxPublicStatus;
  defaultPath?: PathId;
  /** True when Gmail OAuth is configured but NEXTAUTH_URL still points at localhost. */
  appUrlLooksLocal?: boolean;
}) {
  const [path, setPath] = useState<PathId>(defaultPath);
  const [easyProvider, setEasyProvider] = useState<EasyEmailProvider>(
    initial.easyEmailProvider ?? "resend",
  );
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

  useEffect(() => {
    setEasyProvider(initial.easyEmailProvider ?? "resend");
  }, [initial.easyEmailProvider]);

  useEffect(() => {
    setPath(defaultPath);
  }, [defaultPath]);

  async function selectPath(next: PathId) {
    setPath(next);
    if (!canEdit) return;
    try {
      await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredSendPath: next }),
      });
    } catch {
      // non-blocking — Save settings also persists path
    }
  }

  const warmthMeta = WARMTH.find((w) => w.id === warmth) ?? WARMTH[0];
  const isMaileroo = easyProvider === "maileroo";

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
      setMsg("Mailbox disconnected. Easy (Resend / Maileroo) still works.");
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
            Easy = any domain via Resend or Maileroo. Pro = send through your real Google
            mailbox.
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-full border border-white/10 bg-ink-900/60 p-1">
          <button
            type="button"
            onClick={() => void selectPath("easy")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              path === "easy"
                ? "bg-aurora-400 text-ink-950"
                : "text-mist-300 hover:text-mist-100"
            }`}
          >
            Easy — API
          </button>
          <button
            type="button"
            onClick={() => void selectPath("pro")}
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
                Pick <span className="text-mist-100">Resend</span> or{" "}
                <span className="text-mist-100">Maileroo</span> below, create a free account,
                and add your sending domain.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-lg font-semibold text-aurora-300">2</span>
              <span>
                Paste From name, From email on <span className="text-mist-100">your domain</span>,
                and the API key. Then add the SPF / DKIM records{" "}
                <span className="text-mist-100">{isMaileroo ? "Maileroo" : "Resend"}</span> shows
                in their dashboard to your DNS host (Cloudflare, GoDaddy, Hostinger…). This is
                new auth for <em>sending</em> — separate from Zoho/Hostinger mailbox login.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-lg font-semibold text-aurora-300">3</span>
              <span>
                {isMaileroo
                  ? "Confirm the domain shows verified in Maileroo. Approve each outreach before send"
                  : "Watch domain health turn green. Approve each outreach before send"}
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
              easyProvider={easyProvider}
              onEasyProviderChange={setEasyProvider}
            />
          </div>

          {isMaileroo ? (
            <div className="rounded-xl2 border border-white/10 bg-ink-900/40 px-5 py-4 text-sm text-mist-300">
              <p className="font-medium text-mist-100">Domain checklist (Maileroo)</p>
              <p className="mt-1 text-mist-500">
                Open your domain in the{" "}
                <a
                  href="https://maileroo.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-aurora-300 hover:underline"
                >
                  Maileroo dashboard
                </a>
                , copy SPF / DKIM / DMARC into your DNS host, and wait until Maileroo marks
                the domain verified. Lodestar&apos;s live DNS panel is Resend-only for now.
              </p>
            </div>
          ) : (
            <DomainHealthPanel />
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl2 border border-white/10 bg-ink-900/40 p-5">
            <p className="font-display text-xl font-semibold text-mist-100">
              Connect Google or Microsoft
            </p>
            <p className="mt-2 w-full text-sm text-mist-300">
              Pro mailbox connect is for{" "}
              <span className="text-mist-100">Gmail / Google Workspace</span> only right now
              (Microsoft soon). If your mail is hosted elsewhere (Zoho, Hostinger, generic
              SMTP), use Easy (Resend or Maileroo) with your domain DNS instead.
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
                {mailbox.googleReady && appUrlLooksLocal && (
                  <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-xs text-amber-200/90">
                    <code className="text-mist-300">NEXTAUTH_URL</code> still looks like
                    localhost. Set the Wrangler secret to your live Workers URL (e.g.{" "}
                    <code className="text-mist-300">
                      https://leadgeneration.alexxvives.workers.dev
                    </code>
                    ) or Connect Google will fail with redirect_uri_mismatch.
                  </p>
                )}
              </div>
            )}

            {msg && <p className="mt-3 text-sm text-mist-300">{msg}</p>}
            {mailbox.connected && appUrlLooksLocal && (
              <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-xs text-amber-200/90">
                <code className="text-mist-300">NEXTAUTH_URL</code> looks like localhost —
                reconnect Google after setting the live Workers URL as a Wrangler secret.
              </p>
            )}
          </div>

          <div
            id="sending-identity-pro"
            className="scroll-mt-8 rounded-xl2 border border-white/10 p-5"
            data-tour="sending-identity"
          >
            <h3 className="mb-1 text-sm font-semibold text-mist-100">Sending identity</h3>
            <p className="mb-4 text-xs text-mist-500">
              Display name for the From line. From email comes from the connected mailbox when
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

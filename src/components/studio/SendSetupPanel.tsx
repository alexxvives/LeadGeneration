"use client";

import { useEffect, useState } from "react";
import { CheckIcon, MailIcon } from "@/components/icons";
import {
  EmailSettingsForm,
  type EmailSettingsDefaults,
  type EmailSettingsValues,
} from "@/components/studio/EmailSettingsForm";
import { DomainHealthPanel } from "@/components/studio/DomainHealthChecklist";
import { EmailVerifySettings } from "@/components/studio/EmailVerifySettings";
import {
  loadWarmupProfile,
  recommendedDailySoftCap,
  todayKey,
} from "@/lib/email/warmup";
import type { EasyEmailProvider, MailboxPublicStatus } from "@/lib/types";

type PathId = "easy" | "pro";

/**
 * Dual send-path framing: Easy (Resend or Maileroo) is the default wizard;
 * Pro mailbox connect (ADR 0010 — Google first; Microsoft coming).
 */
export function SendSetupPanel({
  initial,
  defaults,
  canEdit,
  canSendEmail: _canSendEmail,
  mailbox: mailboxInitial,
  defaultPath = "easy",
  appUrlLooksLocal = false,
  canVerifyEmail = false,
  emailVerifyEnabled = true,
}: {
  initial: EmailSettingsValues;
  defaults: EmailSettingsDefaults;
  canEdit: boolean;
  canSendEmail: boolean;
  mailbox: MailboxPublicStatus;
  defaultPath?: PathId;
  /** True when Gmail OAuth is configured but NEXTAUTH_URL still points at localhost. */
  appUrlLooksLocal?: boolean;
  /** Server has Zeruh / Maileroo Verify key. */
  canVerifyEmail?: boolean;
  emailVerifyEnabled?: boolean;
}) {
  void _canSendEmail;
  const [path, setPath] = useState<PathId>(defaultPath);
  const [easyProvider, setEasyProvider] = useState<EasyEmailProvider>(
    initial.easyEmailProvider ?? "resend",
  );
  const [mailbox, setMailbox] = useState(mailboxInitial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMailbox(mailboxInitial);
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
      // non-blocking — identity fields auto-save on blur too
    }
  }

  const isMaileroo = easyProvider === "maileroo";
  const softCap = recommendedDailySoftCap(
    mailbox.connected
      ? loadWarmupProfile()
      : { startedOn: todayKey(), days: {} },
  );

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
    window.location.href = "/api/mailbox/google/start";
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
                ? "bg-aurora-400 text-on-accent"
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
                ? "bg-aurora-400 text-on-accent"
                : "text-mist-300 hover:text-mist-100"
            }`}
          >
            Pro — mailbox
          </button>
        </div>
      </div>

      {path === "easy" ? (
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
          {!isMaileroo ? (
            <div className="mt-4">
              <DomainHealthPanel compact />
            </div>
          ) : null}
          <EmailVerifySettings
            canVerify={canVerifyEmail}
            initialEnabled={emailVerifyEnabled}
            canEdit={canEdit}
          />
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
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!mailbox.googleReady || !canEdit}
                    onClick={connectGoogle}
                    className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
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

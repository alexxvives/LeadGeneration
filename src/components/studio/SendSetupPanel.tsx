"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MailIcon } from "@/components/icons";
import {
  EmailSettingsForm,
  type EmailSettingsDefaults,
  type EmailSettingsValues,
} from "@/components/studio/EmailSettingsForm";
import { DomainHealthPanel } from "@/components/studio/DomainHealthChecklist";
import { EmailVerifySettings } from "@/components/studio/EmailVerifySettings";
import { Spinner } from "@/components/ui";
import {
  loadOutreachProfiles,
  OUTREACH_PROFILE_CHANGE_EVENT,
} from "@/lib/sender-profile";
import type { EasyEmailProvider } from "@/lib/types";

type PublicSend = {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  easyEmailProvider: EasyEmailProvider;
  preferredSendPath: "easy" | "pro" | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  hasResendKey: boolean;
  hasMailerooKey: boolean;
  hasSmtpPass: boolean;
};

function toEmailSettingsValues(send: PublicSend): EmailSettingsValues {
  return {
    fromName: send.fromName,
    fromEmail: send.fromEmail,
    replyTo: send.replyTo,
    physicalAddress: send.physicalAddress,
    easyEmailProvider: send.easyEmailProvider ?? "resend",
    preferredSendPath: "easy",
    smtpHost: send.smtpHost,
    smtpPort: send.smtpPort,
    smtpUser: send.smtpUser,
    hasResendKey: send.hasResendKey,
    hasMailerooKey: send.hasMailerooKey,
    hasSmtpPass: send.hasSmtpPass,
  };
}

/**
 * Easy send setup (Resend / Maileroo / SMTP). From + keys are scoped to the
 * active outreach profile (board-linked).
 */
export function SendSetupPanel({
  initial,
  defaults,
  canEdit,
  canSendEmail: _canSendEmail,
  canVerifyEmail = false,
  emailVerifyEnabled = true,
}: {
  initial: EmailSettingsValues;
  defaults: EmailSettingsDefaults;
  canEdit: boolean;
  canSendEmail: boolean;
  /** Server has MYEMAILVERIFIER_API_KEY. */
  canVerifyEmail?: boolean;
  emailVerifyEnabled?: boolean;
}) {
  void _canSendEmail;
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("");
  const [sendValues, setSendValues] = useState<EmailSettingsValues>(() => ({
    ...initial,
    preferredSendPath: "easy",
  }));
  const [easyProvider, setEasyProvider] = useState<EasyEmailProvider>(
    initial.easyEmailProvider ?? "resend",
  );
  const [testTo, setTestTo] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [loadingSend, setLoadingSend] = useState(false);
  const loadSeq = useRef(0);

  const applyLocalProfile = useCallback(() => {
    const store = loadOutreachProfiles();
    const active =
      store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
    setProfileId(active?.id ?? null);
    setProfileName(active?.name?.trim() || "Profile");
    return active?.id ?? null;
  }, []);

  const loadSendForProfile = useCallback(
    async (id: string | null) => {
      const seq = ++loadSeq.current;
      if (!id) {
        setSendValues({ ...initial, preferredSendPath: "easy" });
        setEasyProvider(initial.easyEmailProvider ?? "resend");
        return;
      }
      setLoadingSend(true);
      try {
        const res = await fetch(
          `/api/workspace/settings?profileId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        if (seq !== loadSeq.current) return;
        if (!res.ok) return;
        const data = (await res.json()) as {
          send?: PublicSend;
          profileId?: string | null;
        };
        if (seq !== loadSeq.current) return;
        if (!data.send) return;
        const next = toEmailSettingsValues(data.send);
        setSendValues(next);
        setEasyProvider(next.easyEmailProvider ?? "resend");
      } catch {
        /* keep current */
      } finally {
        if (seq === loadSeq.current) setLoadingSend(false);
      }
    },
    [initial],
  );

  useEffect(() => {
    const id = applyLocalProfile();
    void loadSendForProfile(id);
    // Ensure workspace prefers Easy (Pro mailbox path removed from product UI).
    void fetch("/api/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferredSendPath: "easy",
        ...(id ? { profileId: id } : {}),
      }),
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    const onChange = () => {
      const id = applyLocalProfile();
      void loadSendForProfile(id);
    };
    window.addEventListener(OUTREACH_PROFILE_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener(OUTREACH_PROFILE_CHANGE_EVENT, onChange);
    };
  }, [applyLocalProfile, loadSendForProfile]);

  const showResendDns = easyProvider === "resend";

  async function sendTest() {
    const to = testTo.trim();
    if (!to) return;
    setTestBusy(true);
    setTestMsg(null);
    setTestOk(null);
    try {
      const res = await fetch("/api/send/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        provider?: string;
        demo?: boolean;
      };
      if (!res.ok || !data.ok) {
        setTestOk(false);
        setTestMsg(data.error ?? "Could not send test email");
        return;
      }
      setTestOk(true);
      if (data.demo) {
        setTestMsg(
          "Demo mode — no provider configured. Send was simulated (check server logs).",
        );
      } else {
        const via = data.provider ? ` via ${data.provider}` : "";
        setTestMsg(`Test email sent${via}. Check ${to}.`);
      }
    } catch {
      setTestOk(false);
      setTestMsg("Network error");
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-mist-500">
          How do you want to send?
          {profileName ? (
            <span className="ml-2 normal-case tracking-normal text-aurora-300">
              · {profileName}
            </span>
          ) : null}
        </h2>
        <div
          id="sending-identity"
          className="scroll-mt-8 rounded-xl2 border border-white/10 p-5"
          data-tour="sending-identity"
        >
          <h3 className="mb-1 text-sm font-semibold text-mist-100">
            Sending identity
            {profileName ? (
              <span className="ml-1.5 font-normal text-mist-500">
                for {profileName}
              </span>
            ) : null}
          </h3>
          <p className="mb-4 text-xs text-mist-500">
            From address and keys for this board&apos;s outreach profile. Select a
            board in the sidebar to switch brands.
          </p>
          {loadingSend ? (
            <div className="flex items-center gap-2 py-6 text-sm text-mist-500">
              <Spinner className="h-4 w-4" />
              Loading send settings…
            </div>
          ) : (
            <EmailSettingsForm
              key={profileId ?? "legacy"}
              initial={sendValues}
              defaults={defaults}
              canEdit={canEdit}
              variant="easy"
              easyProvider={easyProvider}
              onEasyProviderChange={setEasyProvider}
              profileId={profileId}
            />
          )}
          {showResendDns ? (
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
      </div>

      <div className="rounded-xl2 border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-mist-100">Send a test email</h3>
        <p className="mt-1 text-xs text-mist-500">
          Uses the active profile&apos;s Easy setup
          {profileName ? ` (${profileName})` : ""}. Enter any inbox to confirm
          delivery.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => {
              setTestTo(e.target.value);
              setTestMsg(null);
              setTestOk(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && testTo.trim() && !testBusy && canEdit) {
                void sendTest();
              }
            }}
            placeholder="you@example.com"
            disabled={!canEdit || testBusy}
            className="min-w-[14rem] flex-1 rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!canEdit || testBusy || !testTo.trim()}
            onClick={() => void sendTest()}
            className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-4 py-2 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          >
            {testBusy ? <Spinner className="h-3.5 w-3.5" /> : <MailIcon className="h-4 w-4" />}
            {testBusy ? "Sending…" : "Send test"}
          </button>
        </div>
        {testMsg ? (
          <p
            className={`mt-3 text-sm ${
              testOk === false
                ? "text-rose-300"
                : testOk
                  ? "text-aurora-300"
                  : "text-mist-300"
            }`}
          >
            {testMsg}
          </p>
        ) : null}
      </div>
    </div>
  );
}

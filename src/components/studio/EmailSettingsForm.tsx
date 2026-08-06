"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PasswordField } from "@/components/PasswordField";
import { Spinner } from "@/components/ui";
import { MailboxAgePicker } from "@/components/studio/MailboxAgePicker";
import {
  loadSenderProfile,
  saveSenderProfile,
} from "@/lib/sender-profile";
import type { EasyEmailProvider } from "@/lib/types";

/** Visual stand-in when a key is saved — never the real secret (Art. III.5). */
const SAVED_KEY_MASK = "••••••••••••••••••••••••••••••••••••";

export interface EmailSettingsValues {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  /** Never SSR the raw key — use has* flags instead. */
  resendApiKey?: string | null;
  mailerooApiKey?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  easyEmailProvider: EasyEmailProvider;
  preferredSendPath?: "easy" | "pro" | null;
  hasResendKey?: boolean;
  hasMailerooKey?: boolean;
  hasSmtpPass?: boolean;
}

/** Env-var defaults shown as placeholder text when the workspace has no override. */
export interface EmailSettingsDefaults {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  physicalAddress: string;
}

export function EmailSettingsForm({
  initial,
  defaults,
  canEdit,
  liveAppUrl,
  /** Easy = name / from / provider key. Pro = name (From from mailbox when linked). */
  variant = "easy",
  /** When set (Pro connected), From email is read-only. */
  lockedFromEmail,
  /** Controlled Easy provider (SendSetupPanel owns the picker). */
  easyProvider,
  onEasyProviderChange,
  /** Outreach profile that owns this Sending identity. */
  profileId,
}: {
  initial: EmailSettingsValues;
  defaults: EmailSettingsDefaults;
  canEdit: boolean;
  liveAppUrl?: string;
  variant?: "easy" | "pro";
  lockedFromEmail?: string | null;
  easyProvider?: EasyEmailProvider;
  onEasyProviderChange?: (p: EasyEmailProvider) => void;
  profileId?: string | null;
}) {
  const [values, setValues] = useState({
    fromName: initial.fromName,
    fromEmail: initial.fromEmail,
    easyEmailProvider: initial.easyEmailProvider ?? "resend",
    smtpHost: initial.smtpHost ?? "",
    smtpPort: initial.smtpPort != null ? String(initial.smtpPort) : "465",
    smtpUser: initial.smtpUser ?? "",
  });
  const [resendDraft, setResendDraft] = useState(
    initial.hasResendKey ? SAVED_KEY_MASK : "",
  );
  const [mailerooDraft, setMailerooDraft] = useState(
    initial.hasMailerooKey ? SAVED_KEY_MASK : "",
  );
  const [smtpPassDraft, setSmtpPassDraft] = useState(
    initial.hasSmtpPass ? SAVED_KEY_MASK : "",
  );
  const [hasResendKey, setHasResendKey] = useState(!!initial.hasResendKey);
  const [hasMailerooKey, setHasMailerooKey] = useState(!!initial.hasMailerooKey);
  const [hasSmtpPass, setHasSmtpPass] = useState(!!initial.hasSmtpPass);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastField = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  useEffect(() => {
    setValues({
      fromName: initial.fromName,
      fromEmail: initial.fromEmail,
      easyEmailProvider: initial.easyEmailProvider ?? "resend",
      smtpHost: initial.smtpHost ?? "",
      smtpPort: initial.smtpPort != null ? String(initial.smtpPort) : "465",
      smtpUser: initial.smtpUser ?? "",
    });
    setHasResendKey(!!initial.hasResendKey);
    setHasMailerooKey(!!initial.hasMailerooKey);
    setHasSmtpPass(!!initial.hasSmtpPass);
    setResendDraft(initial.hasResendKey ? SAVED_KEY_MASK : "");
    setMailerooDraft(initial.hasMailerooKey ? SAVED_KEY_MASK : "");
    setSmtpPassDraft(initial.hasSmtpPass ? SAVED_KEY_MASK : "");
  }, [
    initial.fromName,
    initial.fromEmail,
    initial.easyEmailProvider,
    initial.hasResendKey,
    initial.hasMailerooKey,
    initial.hasSmtpPass,
    initial.smtpHost,
    initial.smtpPort,
    initial.smtpUser,
  ]);

  const isPro = variant === "pro";
  const fromLocked = isPro && !!lockedFromEmail;
  // SMTP removed from product UI — legacy smtp workspaces edit as Resend until switched.
  const rawProvider: EasyEmailProvider =
    easyProvider ?? values.easyEmailProvider ?? "resend";
  const provider: EasyEmailProvider =
    rawProvider === "smtp" ? "resend" : rawProvider;

  const setField = (key: "fromName" | "fromEmail", v: string) => {
    setSaved(false);
    setSavedHint(null);
    lastField.current = key;
    setValues((prev) => ({ ...prev, [key]: v || null }));
  };

  const setProvider = (p: EasyEmailProvider) => {
    setSaved(false);
    setSavedHint(null);
    setValues((prev) => ({ ...prev, easyEmailProvider: p }));
    onEasyProviderChange?.(p);
  };

  const focusBaseline = useRef<{
    fromName: string | null;
    fromEmail: string | null;
    resendDraft: string;
    mailerooDraft: string;
    smtpPassDraft: string;
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    provider: EasyEmailProvider;
  } | null>(null);

  const captureFocus = () => {
    focusBaseline.current = {
      fromName: values.fromName,
      fromEmail: values.fromEmail,
      resendDraft,
      mailerooDraft,
      smtpPassDraft,
      smtpHost: values.smtpHost,
      smtpPort: values.smtpPort,
      smtpUser: values.smtpUser,
      provider,
    };
  };

  const isDirtyVsFocus = () => {
    const b = focusBaseline.current;
    if (!b) return true;
    return (
      b.fromName !== values.fromName ||
      b.fromEmail !== values.fromEmail ||
      b.resendDraft !== resendDraft ||
      b.mailerooDraft !== mailerooDraft ||
      b.smtpPassDraft !== smtpPassDraft ||
      b.smtpHost !== values.smtpHost ||
      b.smtpPort !== values.smtpPort ||
      b.smtpUser !== values.smtpUser ||
      b.provider !== provider
    );
  };

  const saveIfChanged = async () => {
    if (!isDirtyVsFocus()) return;
    await save();
  };

  const isNewKey = (draft: string) =>
    !!draft.trim() && draft !== SAVED_KEY_MASK;

  const save = async (opts?: { providerOverride?: EasyEmailProvider }) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setSaved(false);
    setSavedHint(null);
    setError(null);
    const activeProvider = opts?.providerOverride ?? provider;
    try {
      const payload: Record<string, unknown> = isPro
        ? {
            fromName: values.fromName,
            preferredSendPath: "pro",
            ...(fromLocked ? { fromEmail: lockedFromEmail } : {}),
          }
        : {
            fromName: values.fromName,
            fromEmail: values.fromEmail,
            easyEmailProvider: activeProvider,
            preferredSendPath: "easy",
          };
      if (profileId) payload.profileId = profileId;

      if (!isPro) {
        if (isNewKey(resendDraft)) payload.resendApiKey = resendDraft.trim();
        if (isNewKey(mailerooDraft)) payload.mailerooApiKey = mailerooDraft.trim();
        if (activeProvider === "smtp" || values.smtpHost || values.smtpUser) {
          payload.smtpHost = values.smtpHost.trim() || null;
          const portNum = Number.parseInt(values.smtpPort.trim(), 10);
          payload.smtpPort = Number.isFinite(portNum) ? portNum : 465;
          payload.smtpUser = values.smtpUser.trim() || null;
        }
        if (isNewKey(smtpPassDraft)) payload.smtpPass = smtpPassDraft.trim();
      }

      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Save failed");
      } else {
        // Sync From name → profile displayName only when the user edited From
        // name (not on provider switch — that was reloading Sending twice).
        const name = values.fromName?.trim() ?? "";
        if (name && profileId && lastField.current === "fromName") {
          try {
            const p = loadSenderProfile();
            if (p.id === profileId) {
              const prev = (initial.fromName ?? "").trim();
              if (!p.displayName.trim() || p.displayName.trim() === prev) {
                saveSenderProfile({ ...p, displayName: name });
              }
            }
          } catch {
            /* ignore local sync */
          }
        }
        if (!isPro) {
          const nextHasResend = isNewKey(resendDraft) || hasResendKey;
          const nextHasMaileroo = isNewKey(mailerooDraft) || hasMailerooKey;
          const nextHasSmtp = isNewKey(smtpPassDraft) || hasSmtpPass;
          setHasResendKey(nextHasResend);
          setHasMailerooKey(nextHasMaileroo);
          setHasSmtpPass(nextHasSmtp);
          setResendDraft(nextHasResend ? SAVED_KEY_MASK : "");
          setMailerooDraft(nextHasMaileroo ? SAVED_KEY_MASK : "");
          setSmtpPassDraft(nextHasSmtp ? SAVED_KEY_MASK : "");
        }
        setSaved(true);
        setSavedHint(lastField.current);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => {
          setSaved(false);
          setSavedHint(null);
        }, 2000);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const setProviderAndSave = (p: EasyEmailProvider) => {
    lastField.current = "easyProvider";
    setProvider(p);
    void save({ providerOverride: p });
  };

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-2.5 text-sm text-mist-100 outline-none transition-colors placeholder:text-mist-600 focus:border-aurora-400/60 disabled:opacity-40";

  const isMaileroo = provider === "maileroo";

  const onKeyDraftChange = (
    which: "resend" | "maileroo" | "smtpPass",
    raw: string,
  ) => {
    setSaved(false);
    setSavedHint(null);
    lastField.current =
      which === "resend"
        ? "resendKey"
        : which === "maileroo"
          ? "mailerooKey"
          : "smtpPass";
    const prev =
      which === "resend"
        ? resendDraft
        : which === "maileroo"
          ? mailerooDraft
          : smtpPassDraft;
    const set =
      which === "resend"
        ? setResendDraft
        : which === "maileroo"
          ? setMailerooDraft
          : setSmtpPassDraft;
    // First edit while masked → treat input as a fresh key, not append to bullets.
    if (prev === SAVED_KEY_MASK && raw !== SAVED_KEY_MASK) {
      const stripped = raw.replace(/•/g, "");
      set(stripped);
      return;
    }
    set(raw);
  };

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-sm text-amber-200/90">
          To edit these fields, open the{" "}
          {liveAppUrl ? (
            <a
              href={liveAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-100 underline-offset-2 hover:underline"
            >
              live app → Settings → Sending identity
            </a>
          ) : (
            <span className="font-medium text-amber-100">live app → Settings → Sending identity</span>
          )}
          , sign in, and save your from name and from email there.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-start">
        <Field
          label="Your name"
          hint={fromLocked ? undefined : "Shown as the inbox From name"}
          saved={saved && savedHint === "fromName"}
        >
          <input
            value={values.fromName ?? ""}
            onChange={(e) => setField("fromName", e.target.value)}
            onFocus={captureFocus}
            onBlur={() => void saveIfChanged()}
            placeholder="Alex Rivera"
            disabled={!canEdit}
            className={inputCls}
          />
        </Field>
        <Field
          label="From email"
          hint={fromLocked ? "From your connected mailbox" : undefined}
          saved={saved && savedHint === "fromEmail"}
        >
          <input
            type="email"
            value={fromLocked ? lockedFromEmail! : (values.fromEmail ?? "")}
            onChange={(e) => setField("fromEmail", e.target.value)}
            onFocus={captureFocus}
            onBlur={() => {
              if (!fromLocked) void saveIfChanged();
            }}
            placeholder={defaults.fromEmail}
            disabled={!canEdit || fromLocked}
            className={inputCls}
          />
        </Field>
        <MailboxAgePicker disabled={!canEdit} />
      </div>

      {!isPro && (
        <div data-tour="resend-key" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="shrink-0">
              <p className="mb-1.5 text-sm font-medium text-mist-100">Sending provider</p>
              <div className="inline-flex rounded-full border border-white/10 bg-ink-900/60 p-1">
                {(
                  [
                    ["resend", "Resend"],
                    ["maileroo", "Maileroo"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setProviderAndSave(id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      provider === id
                        ? "bg-aurora-400 text-on-accent"
                        : "text-mist-300 hover:text-mist-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              {isMaileroo ? (
                <Field
                  label="Maileroo sending key"
                  saved={saved && savedHint === "mailerooKey"}
                  hint={
                    <span className="max-w-[16rem] text-right leading-snug sm:max-w-[20rem]">
                      Free account at{" "}
                      <a
                        href="https://maileroo.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-aurora-300 hover:underline"
                      >
                        maileroo.com
                      </a>
                      → add your domain → create a Sending Key → paste here.
                    </span>
                  }
                >
                  <PasswordField
                    value={mailerooDraft}
                    savedMask={SAVED_KEY_MASK}
                    onChange={(e) => onKeyDraftChange("maileroo", e.target.value)}
                    onFocus={captureFocus}
                    onBlur={() => void saveIfChanged()}
                    placeholder="Your Maileroo sending key"
                    disabled={!canEdit}
                    inputClassName={`${inputCls} pr-11`}
                  />
                </Field>
              ) : (
                <Field
                  label="Resend API key"
                  saved={saved && savedHint === "resendKey"}
                  hint={
                    <span className="max-w-[16rem] text-right leading-snug sm:max-w-[20rem]">
                      Free account at{" "}
                      <a
                        href="https://resend.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-aurora-300 hover:underline"
                      >
                        resend.com
                      </a>
                      → add your domain → create an API key → paste here.
                    </span>
                  }
                >
                  <PasswordField
                    value={resendDraft}
                    savedMask={SAVED_KEY_MASK}
                    onChange={(e) => onKeyDraftChange("resend", e.target.value)}
                    onFocus={captureFocus}
                    onBlur={() => void saveIfChanged()}
                    placeholder="re_xxxxxxxxxxxx"
                    disabled={!canEdit}
                    inputClassName={`${inputCls} pr-11`}
                  />
                </Field>
              )}
            </div>
          </div>
          {isMaileroo ? <WebhookHint liveAppUrl={liveAppUrl} /> : null}
        </div>
      )}

      {(error || saving) && (
        <div className="flex items-center justify-end gap-3">
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {saving && (
            <span className="flex items-center gap-1.5 text-sm text-mist-500">
              <Spinner className="h-3.5 w-3.5" /> Saving…
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  saved,
  children,
}: {
  label: string;
  hint?: ReactNode;
  saved?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <p className="relative text-sm font-medium text-mist-100">
          {label}
          <span
            aria-live="polite"
            className={`pointer-events-none absolute left-full top-0 ml-2 whitespace-nowrap text-xs font-medium text-aurora-300 transition-opacity ${
              saved ? "opacity-100" : "opacity-0"
            }`}
          >
            Saved
          </span>
        </p>
        {hint ? (
          <div className="ml-auto min-w-0 text-[11px] text-mist-500">{hint}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Maileroo-only: no create-webhook API, so users paste the URL once (optional). */
function WebhookHint({ liveAppUrl }: { liveAppUrl?: string | null }) {
  const origin =
    (typeof window !== "undefined" ? window.location.origin : "") ||
    liveAppUrl?.replace(/\/$/, "") ||
    "https://leadgeneration.alexxvives.workers.dev";
  const url = `${origin}/api/webhooks/maileroo`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 rounded-lg border border-white/8 bg-ink-950/40 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-mist-500">
        Optional · bounce / reply tracking
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-mist-400">
        Maileroo dashboard → Webhooks → add this URL → pick delivered / bounced
        / failed events. Sending already works without this step.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-ink-900/80 px-2 py-1.5 text-[11px] text-aurora-200/90">
          {url}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-mist-300 hover:border-aurora-400/40 hover:text-mist-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

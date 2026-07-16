"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/PasswordField";
import { Spinner } from "@/components/ui";
import { loadSenderProfile, saveSenderProfile, buildSignature } from "@/lib/sender-profile";
import type { EasyEmailProvider } from "@/lib/types";

/** Visual stand-in when a key is saved — never the real secret (Art. III.5). */
const SAVED_KEY_MASK = "••••••••••••••••";

export interface EmailSettingsValues {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  /** Never SSR the raw key — use has* flags instead. */
  resendApiKey?: string | null;
  mailerooApiKey?: string | null;
  easyEmailProvider: EasyEmailProvider;
  preferredSendPath?: "easy" | "pro" | null;
  hasResendKey?: boolean;
  hasMailerooKey?: boolean;
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
}: {
  initial: EmailSettingsValues;
  defaults: EmailSettingsDefaults;
  canEdit: boolean;
  liveAppUrl?: string;
  variant?: "easy" | "pro";
  lockedFromEmail?: string | null;
  easyProvider?: EasyEmailProvider;
  onEasyProviderChange?: (p: EasyEmailProvider) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    fromName: initial.fromName,
    fromEmail: initial.fromEmail,
    easyEmailProvider: initial.easyEmailProvider ?? "resend",
  });
  const [resendDraft, setResendDraft] = useState(
    initial.hasResendKey ? SAVED_KEY_MASK : "",
  );
  const [mailerooDraft, setMailerooDraft] = useState(
    initial.hasMailerooKey ? SAVED_KEY_MASK : "",
  );
  const [hasResendKey, setHasResendKey] = useState(!!initial.hasResendKey);
  const [hasMailerooKey, setHasMailerooKey] = useState(!!initial.hasMailerooKey);
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
    });
    setHasResendKey(!!initial.hasResendKey);
    setHasMailerooKey(!!initial.hasMailerooKey);
    setResendDraft(initial.hasResendKey ? SAVED_KEY_MASK : "");
    setMailerooDraft(initial.hasMailerooKey ? SAVED_KEY_MASK : "");
  }, [
    initial.fromName,
    initial.fromEmail,
    initial.easyEmailProvider,
    initial.hasResendKey,
    initial.hasMailerooKey,
  ]);

  const isPro = variant === "pro";
  const fromLocked = isPro && !!lockedFromEmail;
  const provider: EasyEmailProvider =
    easyProvider ?? values.easyEmailProvider ?? "resend";

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
    provider: EasyEmailProvider;
  } | null>(null);

  const captureFocus = () => {
    focusBaseline.current = {
      fromName: values.fromName,
      fromEmail: values.fromEmail,
      resendDraft,
      mailerooDraft,
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

      if (!isPro) {
        if (isNewKey(resendDraft)) payload.resendApiKey = resendDraft.trim();
        if (isNewKey(mailerooDraft)) payload.mailerooApiKey = mailerooDraft.trim();
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
        if (values.fromName) {
          const profile = loadSenderProfile();
          const next = { ...profile, displayName: values.fromName };
          const lines = profile.signature.split("\n");
          if (!profile.signature.trim()) {
            next.signature = buildSignature(next);
          } else if (!profile.displayName || lines[0] === profile.displayName) {
            lines[0] = values.fromName;
            next.signature = lines.join("\n");
          }
          saveSenderProfile(next);
        }
        if (!isPro) {
          const nextHasResend = isNewKey(resendDraft) || hasResendKey;
          const nextHasMaileroo = isNewKey(mailerooDraft) || hasMailerooKey;
          setHasResendKey(nextHasResend);
          setHasMailerooKey(nextHasMaileroo);
          setResendDraft(nextHasResend ? SAVED_KEY_MASK : "");
          setMailerooDraft(nextHasMaileroo ? SAVED_KEY_MASK : "");
        }
        setSaved(true);
        setSavedHint(lastField.current);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => {
          setSaved(false);
          setSavedHint(null);
        }, 2000);
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const setProviderAndSave = (p: EasyEmailProvider) => {
    setProvider(p);
    void save({ providerOverride: p });
  };

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-2.5 text-sm text-mist-100 outline-none transition-colors placeholder:text-mist-600 focus:border-aurora-400/60 disabled:opacity-40";

  const isMaileroo = provider === "maileroo";

  const onKeyDraftChange = (
    which: "resend" | "maileroo",
    raw: string,
  ) => {
    setSaved(false);
    setSavedHint(null);
    lastField.current = which === "resend" ? "resendKey" : "mailerooKey";
    const prev = which === "resend" ? resendDraft : mailerooDraft;
    const set = which === "resend" ? setResendDraft : setMailerooDraft;
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Your name"
          hint="Inbox From + draft sign-off"
          saved={saved && savedHint === "fromName"}
        >
          <input
            value={values.fromName ?? ""}
            onChange={(e) => setField("fromName", e.target.value)}
            onFocus={captureFocus}
            onBlur={() => void saveIfChanged()}
            placeholder={defaults.fromName}
            disabled={!canEdit}
            className={inputCls}
          />
        </Field>
        <Field
          label="From email"
          hint={fromLocked ? "From your connected mailbox" : "Must match your verified domain"}
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
      </div>

      {!isPro && (
        <div
          data-tour="resend-key"
          className="rounded-xl border border-aurora-400/20 bg-aurora-400/[0.04] p-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="shrink-0">
              <p className="mb-1.5 text-sm font-medium text-mist-100">Sending provider</p>
              <div className="inline-flex rounded-full border border-white/10 bg-ink-900/60 p-1">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setProviderAndSave("resend")}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    !isMaileroo
                      ? "bg-aurora-400 text-ink-950"
                      : "text-mist-300 hover:text-mist-100"
                  }`}
                >
                  Resend
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setProviderAndSave("maileroo")}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    isMaileroo
                      ? "bg-aurora-400 text-ink-950"
                      : "text-mist-300 hover:text-mist-100"
                  }`}
                >
                  Maileroo
                </button>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              {isMaileroo ? (
                <Field
                  label="Maileroo sending key"
                  hint="Dashboard → Domains → Sending Keys"
                  saved={saved && savedHint === "mailerooKey"}
                >
                  <PasswordField
                    value={mailerooDraft}
                    savedMask={SAVED_KEY_MASK}
                    onChange={(e) => onKeyDraftChange("maileroo", e.target.value)}
                    onFocus={(e) => {
                      captureFocus();
                      if (mailerooDraft === SAVED_KEY_MASK) e.target.select();
                    }}
                    onBlur={() => void saveIfChanged()}
                    placeholder="Your Maileroo sending key"
                    disabled={!canEdit}
                    inputClassName={`${inputCls} pr-11`}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-mist-500">
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
                  </p>
                </Field>
              ) : (
                <Field
                  label="Resend API key"
                  hint="BYO domain"
                  saved={saved && savedHint === "resendKey"}
                >
                  <PasswordField
                    value={resendDraft}
                    savedMask={SAVED_KEY_MASK}
                    onChange={(e) => onKeyDraftChange("resend", e.target.value)}
                    onFocus={(e) => {
                      captureFocus();
                      if (resendDraft === SAVED_KEY_MASK) e.target.select();
                    }}
                    onBlur={() => void saveIfChanged()}
                    placeholder="re_xxxxxxxxxxxx"
                    disabled={!canEdit}
                    inputClassName={`${inputCls} pr-11`}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-mist-500">
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
                  </p>
                </Field>
              )}
            </div>
          </div>
          <WebhookHint provider={isMaileroo ? "maileroo" : "resend"} liveAppUrl={liveAppUrl} />
        </div>
      )}

      <div className="flex min-h-[1.5rem] items-center justify-end gap-3">
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {saving && (
          <span className="flex items-center gap-1.5 text-sm text-mist-500">
            <Spinner className="h-3.5 w-3.5" /> Saving…
          </span>
        )}
      </div>
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
          <div className="ml-auto text-xs text-mist-500">{hint}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function WebhookHint({
  provider,
  liveAppUrl,
}: {
  provider: "maileroo" | "resend";
  liveAppUrl?: string | null;
}) {
  const origin =
    (typeof window !== "undefined" ? window.location.origin : "") ||
    liveAppUrl?.replace(/\/$/, "") ||
    "https://leadgeneration.alexxvives.workers.dev";
  const path =
    provider === "maileroo" ? "/api/webhooks/maileroo" : "/api/webhooks/resend";
  const url = `${origin}${path}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 rounded-lg border border-white/8 bg-ink-950/40 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-mist-500">
        Delivery webhooks
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-mist-400">
        Point {provider === "maileroo" ? "Maileroo" : "Resend"} at this URL
        (delivered / bounced events) so Leadify updates delivery status
        automatically.
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@/components/icons";
import { PasswordField } from "@/components/PasswordField";
import { Spinner } from "@/components/ui";
import { loadSenderProfile, saveSenderProfile, buildSignature } from "@/lib/sender-profile";
import type { EasyEmailProvider } from "@/lib/types";

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
  const [resendDraft, setResendDraft] = useState("");
  const [mailerooDraft, setMailerooDraft] = useState("");
  const [hasResendKey, setHasResendKey] = useState(!!initial.hasResendKey);
  const [hasMailerooKey, setHasMailerooKey] = useState(!!initial.hasMailerooKey);
  const [clearResend, setClearResend] = useState(false);
  const [clearMaileroo, setClearMaileroo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues({
      fromName: initial.fromName,
      fromEmail: initial.fromEmail,
      easyEmailProvider: initial.easyEmailProvider ?? "resend",
    });
    setHasResendKey(!!initial.hasResendKey);
    setHasMailerooKey(!!initial.hasMailerooKey);
    setResendDraft("");
    setMailerooDraft("");
    setClearResend(false);
    setClearMaileroo(false);
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
    setValues((prev) => ({ ...prev, [key]: v || null }));
  };

  const setProvider = (p: EasyEmailProvider) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, easyEmailProvider: p }));
    onEasyProviderChange?.(p);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
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
            easyEmailProvider: provider,
            preferredSendPath: "easy",
          };

      if (!isPro) {
        if (clearResend) payload.clearResendApiKey = true;
        else if (resendDraft.trim()) payload.resendApiKey = resendDraft.trim();
        if (clearMaileroo) payload.clearMailerooApiKey = true;
        else if (mailerooDraft.trim()) payload.mailerooApiKey = mailerooDraft.trim();
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
          if (clearResend) setHasResendKey(false);
          else if (resendDraft.trim()) setHasResendKey(true);
          if (clearMaileroo) setHasMailerooKey(false);
          else if (mailerooDraft.trim()) setHasMailerooKey(true);
          setResendDraft("");
          setMailerooDraft("");
          setClearResend(false);
          setClearMaileroo(false);
        }
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-2.5 text-sm text-mist-100 outline-none transition-colors placeholder:text-mist-600 focus:border-aurora-400/60 disabled:opacity-40";

  const isMaileroo = provider === "maileroo";

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
        <Field label="Your name" hint="Inbox From + draft sign-off">
          <input
            value={values.fromName ?? ""}
            onChange={(e) => setField("fromName", e.target.value)}
            placeholder={defaults.fromName}
            disabled={!canEdit}
            className={inputCls}
          />
        </Field>
        <Field
          label="From email"
          hint={fromLocked ? "From your connected mailbox" : "Must match your verified domain"}
        >
          <input
            type="email"
            value={fromLocked ? lockedFromEmail! : (values.fromEmail ?? "")}
            onChange={(e) => setField("fromEmail", e.target.value)}
            placeholder={defaults.fromEmail}
            disabled={!canEdit || fromLocked}
            className={inputCls}
          />
        </Field>
      </div>

      {!isPro && (
        <div
          data-tour="resend-key"
          className="space-y-4 rounded-xl border border-aurora-400/20 bg-aurora-400/[0.04] p-4"
        >
          <div>
            <p className="mb-2 text-sm font-medium text-mist-100">Sending provider</p>
            <div className="inline-flex rounded-full border border-white/10 bg-ink-900/60 p-1">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setProvider("resend")}
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
                onClick={() => setProvider("maileroo")}
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

          {isMaileroo ? (
            <Field
              label="Maileroo sending key"
              hint="Dashboard → Domains → Sending Keys"
            >
              {hasMailerooKey && !clearMaileroo && (
                <p className="mb-2 text-xs text-aurora-300/90">
                  Key saved — paste a new value to replace, or{" "}
                  <button
                    type="button"
                    className="underline hover:text-aurora-200"
                    onClick={() => {
                      setClearMaileroo(true);
                      setMailerooDraft("");
                      setSaved(false);
                    }}
                    disabled={!canEdit}
                  >
                    clear
                  </button>
                  .
                </p>
              )}
              {!clearMaileroo && (
                <PasswordField
                  autoComplete="off"
                  value={mailerooDraft}
                  onChange={(e) => {
                    setMailerooDraft(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={
                    hasMailerooKey ? "Paste new key to replace" : "Your Maileroo sending key"
                  }
                  disabled={!canEdit}
                  inputClassName={`${inputCls} pr-11`}
                />
              )}
              {clearMaileroo && (
                <p className="mt-2 text-xs text-amber-200/90">
                  Will clear the saved Maileroo key on Save.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setClearMaileroo(false)}
                  >
                    Undo
                  </button>
                </p>
              )}
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
                → add your domain → copy DNS → create a Sending Key → paste here.
                Same From email must be on that verified domain.
              </p>
            </Field>
          ) : (
            <Field
              label="Resend API key"
              hint="BYO domain — not a shared Lodestar sender"
            >
              {hasResendKey && !clearResend && (
                <p className="mb-2 text-xs text-aurora-300/90">
                  Key saved — paste a new value to replace, or{" "}
                  <button
                    type="button"
                    className="underline hover:text-aurora-200"
                    onClick={() => {
                      setClearResend(true);
                      setResendDraft("");
                      setSaved(false);
                    }}
                    disabled={!canEdit}
                  >
                    clear
                  </button>
                  .
                </p>
              )}
              {!clearResend && (
                <PasswordField
                  autoComplete="off"
                  value={resendDraft}
                  onChange={(e) => {
                    setResendDraft(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={hasResendKey ? "Paste new key to replace" : "re_xxxxxxxxxxxx"}
                  disabled={!canEdit}
                  inputClassName={`${inputCls} pr-11`}
                />
              )}
              {clearResend && (
                <p className="mt-2 text-xs text-amber-200/90">
                  Will clear the saved Resend key on Save.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setClearResend(false)}
                  >
                    Undo
                  </button>
                </p>
              )}
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
                → add your domain → copy DNS → paste the API key here.
              </p>
            </Field>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-aurora-300">
            <CheckIcon className="h-4 w-4" /> Saved
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.03] disabled:opacity-50"
          >
            {saving ? <Spinner className="h-4 w-4" /> : null}
            {saving ? "Saving…" : "Save settings"}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-mist-100">{label}</p>
        {hint && <p className="text-xs text-mist-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

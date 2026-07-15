"use client";

import { useState } from "react";
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
  resendApiKey: string | null;
  mailerooApiKey: string | null;
  easyEmailProvider: EasyEmailProvider;
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
  const [values, setValues] = useState<EmailSettingsValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = variant === "pro";
  const fromLocked = isPro && !!lockedFromEmail;
  const provider: EasyEmailProvider =
    easyProvider ?? values.easyEmailProvider ?? "resend";

  const set = (key: keyof EmailSettingsValues, v: string) => {
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
      const payload = isPro
        ? {
            fromName: values.fromName,
            ...(fromLocked ? { fromEmail: lockedFromEmail } : {}),
          }
        : {
            fromName: values.fromName,
            fromEmail: values.fromEmail,
            easyEmailProvider: provider,
            resendApiKey: values.resendApiKey,
            mailerooApiKey: values.mailerooApiKey,
          };
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
        setSaved(true);
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
            onChange={(e) => set("fromName", e.target.value)}
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
            onChange={(e) => set("fromEmail", e.target.value)}
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
              <PasswordField
                autoComplete="off"
                value={values.mailerooApiKey ?? ""}
                onChange={(e) => set("mailerooApiKey", e.target.value)}
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
                → add your domain → copy DNS → create a Sending Key → paste here.
                Same From email must be on that verified domain.
              </p>
            </Field>
          ) : (
            <Field
              label="Resend API key"
              hint="BYO domain — not a shared Lodestar sender"
            >
              <PasswordField
                autoComplete="off"
                value={values.resendApiKey ?? ""}
                onChange={(e) => set("resendApiKey", e.target.value)}
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

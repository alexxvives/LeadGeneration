"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import { PasswordField } from "@/components/PasswordField";
import { Spinner } from "@/components/ui";
import { loadSenderProfile, saveSenderProfile } from "@/lib/sender-profile";

export interface EmailSettingsValues {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  resendApiKey: string | null;
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
}: {
  initial: EmailSettingsValues;
  /** Shown as input hints when the workspace has no override. */
  defaults: EmailSettingsDefaults;
  /** False on local preview (no workspace DB) — form is read-only. */
  canEdit: boolean;
  /** Link to the live app Settings when the form can’t be edited here. */
  liveAppUrl?: string;
}) {
  const [values, setValues] = useState<EmailSettingsValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof EmailSettingsValues, v: string) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: v || null }));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Save failed");
      } else {
        // Keep draft sign-off in sync — one name field for From + drafts.
        if (values.fromName) {
          const profile = loadSenderProfile();
          saveSenderProfile({ ...profile, displayName: values.fromName });
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
          , sign in, and save your from name, from email, and mailing address there.
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
        <Field label="From email" hint="The sending address">
          <input
            type="email"
            value={values.fromEmail ?? ""}
            onChange={(e) => set("fromEmail", e.target.value)}
            placeholder={defaults.fromEmail}
            disabled={!canEdit}
            className={inputCls}
          />
        </Field>
        <Field
          label="Reply-to"
          hint="Where their reply lands (optional)"
        >
          <input
            type="email"
            value={values.replyTo ?? ""}
            onChange={(e) => set("replyTo", e.target.value)}
            placeholder={defaults.replyTo || defaults.fromEmail}
            disabled={!canEdit}
            className={inputCls}
          />
        </Field>
        <Field
          label="Mailing address"
          hint="CAN-SPAM — required for real commercial sends"
        >
          <input
            value={values.physicalAddress ?? ""}
            onChange={(e) => set("physicalAddress", e.target.value)}
            placeholder={defaults.physicalAddress}
            disabled={!canEdit}
            className={inputCls}
          />
        </Field>
      </div>
      <p className="text-xs text-mist-500">
        Reply-to is for routing replies to a different inbox than the From address.
        We don&apos;t CC teammates on cold outreach — that hurts deliverability and
        looks spammy. Share the thread yourself after they reply.
      </p>

      <Field
        label="Resend API key"
        hint="Your own Resend account → sends from your verified domain"
      >
        <PasswordField
          autoComplete="off"
          value={values.resendApiKey ?? ""}
          onChange={(e) => set("resendApiKey", e.target.value)}
          placeholder="re_xxxxxxxxxxxx"
          disabled={!canEdit}
          inputClassName={`${inputCls} pr-11`}
        />
        <p className="mt-1 text-[11px] text-mist-500">
          Go to{" "}
          <a
            href="https://resend.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-aurora-300 hover:underline"
          >
            resend.com
          </a>
          , create a free account, add your sending domain (DNS wizard takes ~5 min),
          and paste the API key here. Emails will arrive from your own domain instead
          of the platform&apos;s shared sender.
        </p>
      </Field>

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
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm font-medium text-mist-100">{label}</p>
        {hint && <p className="text-xs text-mist-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

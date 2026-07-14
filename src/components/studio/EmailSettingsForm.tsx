"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";

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
}: {
  initial: EmailSettingsValues;
  /** Platform env-var fallback values — shown as placeholders. */
  defaults: EmailSettingsDefaults;
  /** False in demo/local mode (no D1) — form is read-only. */
  canEdit: boolean;
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
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-xs text-amber-300">
          Running in local / demo mode — these settings are stored per-workspace
          in D1 and only take effect in production.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From name" hint="How you appear in the inbox">
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
          hint="Where replies land (optional — defaults to from email)"
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
        <Field label="Physical address" hint="Required for CAN-SPAM compliance">
          <input
            value={values.physicalAddress ?? ""}
            onChange={(e) => set("physicalAddress", e.target.value)}
            placeholder={defaults.physicalAddress}
            disabled={!canEdit}
            className={inputCls}
          />
        </Field>
      </div>

      <Field
        label="Resend API key"
        hint="Your own Resend account → sends from your verified domain"
      >
        <input
          type="password"
          autoComplete="off"
          value={values.resendApiKey ?? ""}
          onChange={(e) => set("resendApiKey", e.target.value)}
          placeholder="re_xxxxxxxxxxxx"
          disabled={!canEdit}
          className={inputCls}
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

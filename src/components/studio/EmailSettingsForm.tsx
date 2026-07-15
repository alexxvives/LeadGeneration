"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@/components/icons";
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
  const [clearResend, setClearResend] = useState(false);
  const [clearMaileroo, setClearMaileroo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const isNewKey = (draft: string) =>
    !!draft.trim() && draft !== SAVED_KEY_MASK;

  const save = async (opts?: {
    providerOverride?: EasyEmailProvider;
    clearResend?: boolean;
    clearMaileroo?: boolean;
  }) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const activeProvider = opts?.providerOverride ?? provider;
    const doClearResend = opts?.clearResend ?? clearResend;
    const doClearMaileroo = opts?.clearMaileroo ?? clearMaileroo;
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
        if (doClearResend) payload.clearResendApiKey = true;
        else if (isNewKey(resendDraft)) payload.resendApiKey = resendDraft.trim();
        if (doClearMaileroo) payload.clearMailerooApiKey = true;
        else if (isNewKey(mailerooDraft)) payload.mailerooApiKey = mailerooDraft.trim();
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
          const nextHasResend = doClearResend
            ? false
            : isNewKey(resendDraft) || hasResendKey;
          const nextHasMaileroo = doClearMaileroo
            ? false
            : isNewKey(mailerooDraft) || hasMailerooKey;
          setHasResendKey(nextHasResend);
          setHasMailerooKey(nextHasMaileroo);
          setResendDraft(nextHasResend ? SAVED_KEY_MASK : "");
          setMailerooDraft(nextHasMaileroo ? SAVED_KEY_MASK : "");
          setClearResend(false);
          setClearMaileroo(false);
        }
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 2000);
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
        <Field label="Your name" hint="Inbox From + draft sign-off">
          <input
            value={values.fromName ?? ""}
            onChange={(e) => setField("fromName", e.target.value)}
            onBlur={() => void save()}
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
            onBlur={() => {
              if (!fromLocked) void save();
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
          className="space-y-4 rounded-xl border border-aurora-400/20 bg-aurora-400/[0.04] p-4"
        >
          <div>
            <p className="mb-2 text-sm font-medium text-mist-100">Sending provider</p>
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

          {isMaileroo ? (
            <Field
              label="Maileroo sending key"
              hint={
                hasMailerooKey && !clearMaileroo && canEdit ? (
                  <button
                    type="button"
                    className="text-mist-500 underline hover:text-mist-300"
                    onClick={() => {
                      setClearMaileroo(true);
                      setMailerooDraft("");
                      setSaved(false);
                      void save({ clearMaileroo: true });
                    }}
                  >
                    Clear key
                  </button>
                ) : (
                  "Dashboard → Domains → Sending Keys"
                )
              }
            >
              {!clearMaileroo && (
                <PasswordField
                  autoComplete="off"
                  value={mailerooDraft}
                  onChange={(e) => onKeyDraftChange("maileroo", e.target.value)}
                  onFocus={(e) => {
                    if (mailerooDraft === SAVED_KEY_MASK) e.target.select();
                  }}
                  onBlur={() => void save()}
                  placeholder="Your Maileroo sending key"
                  disabled={!canEdit}
                  inputClassName={`${inputCls} pr-11`}
                />
              )}
              {clearMaileroo && (
                <p className="mt-2 text-xs text-amber-200/90">
                  Key will be cleared when you leave this section.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setClearMaileroo(false);
                      setMailerooDraft(SAVED_KEY_MASK);
                    }}
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
              hint={
                hasResendKey && !clearResend && canEdit ? (
                  <button
                    type="button"
                    className="text-mist-500 underline hover:text-mist-300"
                    onClick={() => {
                      setClearResend(true);
                      setResendDraft("");
                      setSaved(false);
                      void save({ clearResend: true });
                    }}
                  >
                    Clear key
                  </button>
                ) : (
                  "BYO domain — not a shared Leadify sender"
                )
              }
            >
              {!clearResend && (
                <PasswordField
                  autoComplete="off"
                  value={resendDraft}
                  onChange={(e) => onKeyDraftChange("resend", e.target.value)}
                  onFocus={(e) => {
                    if (resendDraft === SAVED_KEY_MASK) e.target.select();
                  }}
                  onBlur={() => void save()}
                  placeholder="re_xxxxxxxxxxxx"
                  disabled={!canEdit}
                  inputClassName={`${inputCls} pr-11`}
                />
              )}
              {clearResend && (
                <p className="mt-2 text-xs text-amber-200/90">
                  Key will be cleared when you leave this section.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setClearResend(false);
                      setResendDraft(SAVED_KEY_MASK);
                    }}
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

      <div className="flex min-h-[1.5rem] items-center justify-end gap-3">
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {saving && (
          <span className="flex items-center gap-1.5 text-sm text-mist-500">
            <Spinner className="h-3.5 w-3.5" /> Saving…
          </span>
        )}
        {!saving && saved && (
          <span className="flex items-center gap-1.5 text-sm text-aurora-300">
            <CheckIcon className="h-4 w-4" /> Saved
          </span>
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
  hint?: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-mist-100">{label}</p>
        {hint && <div className="text-xs text-mist-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

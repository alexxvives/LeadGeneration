"use client";

import { useEffect, useState } from "react";
import { loadSenderProfile, saveSenderProfile, type SenderProfile } from "@/lib/sender-profile";

/**
 * Editable outreach voice fields (local to this browser). Used to prefill
 * search offer notes. Does not store SMTP secrets.
 */
export function SenderProfileForm() {
  const [profile, setProfile] = useState<SenderProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadSenderProfile());
  }, []);

  if (!profile) {
    return (
      <div className="rounded-xl2 border border-white/10 p-5 text-sm text-mist-500">
        Loading profile…
      </div>
    );
  }

  const set =
    (field: keyof SenderProfile) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setProfile((p) => (p ? { ...p, [field]: e.target.value } : p));
      setSaved(false);
    };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSenderProfile(profile);
    setSaved(true);
  };

  return (
    <form onSubmit={onSave} className="space-y-4 rounded-xl2 border border-white/10 p-5">
      <p className="text-sm text-mist-300">
        Pitch notes and sign-off for drafts. Your display name lives under Sending
        identity (one place). Stored in this browser only — not synced to the server.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" value={profile.title} onChange={set("title")} placeholder="Founder" />
        <Field
          label="Company"
          value={profile.company}
          onChange={set("company")}
          placeholder="Northstar Studio"
        />
      </div>
      <label className="block">
        <span className="text-xs font-medium text-mist-500">Default offer / pitch</span>
        <textarea
          value={profile.defaultOffer}
          onChange={set("defaultOffer")}
          rows={3}
          placeholder="We help clinics turn website visitors into booked appointments…"
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-mist-500">Email sign-off</span>
        <textarea
          value={profile.signature}
          onChange={set("signature")}
          rows={2}
          placeholder="Best,&#10;Alex"
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.03]"
        >
          Save profile
        </button>
        {saved && <span className="text-sm text-aurora-300">Saved</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-mist-500">{label}</span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
      />
    </label>
  );
}

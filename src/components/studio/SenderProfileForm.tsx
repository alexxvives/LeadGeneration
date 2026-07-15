"use client";

import { useEffect, useState } from "react";
import {
  loadSenderProfile,
  saveSenderProfile,
  SIGNATURE_PLACEHOLDER,
  type SenderProfile,
} from "@/lib/sender-profile";

/**
 * Editable outreach voice fields (local to this browser). Used to prefill
 * search offer notes and the multi-line email sign-off.
 */
export function SenderProfileForm() {
  const [profile, setProfile] = useState<SenderProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = loadSenderProfile();
    if (!p.signature.trim()) p.signature = SIGNATURE_PLACEHOLDER;
    setProfile(p);
  }, []);

  if (!profile) {
    return (
      <div className="rounded-xl2 border border-white/10 p-5 text-sm text-mist-500">
        Loading profile…
      </div>
    );
  }

  const patch = (partial: Partial<SenderProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...partial } : prev));
    setSaved(false);
  };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const next = {
      ...profile,
      signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
    };
    saveSenderProfile(next);
    setProfile(next);
    setSaved(true);
  };

  return (
    <form onSubmit={onSave} className="space-y-4 rounded-xl2 border border-white/10 p-5">
      <p className="text-sm text-mist-300">
        Pitch notes and sign-off for drafts. Your display name is set under Sending
        identity. Stored in this browser only.
      </p>
      <label className="block">
        <span className="text-xs font-medium text-mist-500">Default offer / pitch</span>
        <textarea
          value={profile.defaultOffer}
          onChange={(e) => patch({ defaultOffer: e.target.value })}
          rows={3}
          placeholder="We help clinics turn website visitors into booked appointments…"
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-mist-500">Email sign-off</span>
        <textarea
          value={profile.signature}
          onChange={(e) => patch({ signature: e.target.value })}
          rows={4}
          placeholder={SIGNATURE_PLACEHOLDER}
          className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 font-sans text-sm leading-relaxed text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
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

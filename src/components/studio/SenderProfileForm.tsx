"use client";

import { useEffect, useState } from "react";
import {
  TITLE_OPTIONS,
  DEFAULT_COMPANY,
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
  const [customTitle, setCustomTitle] = useState(false);

  useEffect(() => {
    const p = loadSenderProfile();
    if (!p.company) p.company = DEFAULT_COMPANY;
    if (!p.signature.trim()) p.signature = SIGNATURE_PLACEHOLDER;
    setProfile(p);
    setCustomTitle(!!p.title && !(TITLE_OPTIONS as readonly string[]).includes(p.title));
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
      company: profile.company.trim() || DEFAULT_COMPANY,
      signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
    };
    saveSenderProfile(next);
    setProfile(next);
    setSaved(true);
  };

  const knownTitle = (TITLE_OPTIONS as readonly string[]).includes(profile.title);

  return (
    <form onSubmit={onSave} className="space-y-4 rounded-xl2 border border-white/10 p-5">
      <p className="text-sm text-mist-300">
        Pitch notes and sign-off for drafts. Your display name is set under Sending
        identity. Stored in this browser only.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-mist-500">Position (optional)</span>
          {customTitle || (!knownTitle && profile.title) ? (
            <input
              value={profile.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Co-founder & CEO"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 pr-10 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
            />
          ) : (
            <div className="relative mt-1.5">
              <select
                value={profile.title}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomTitle(true);
                    return;
                  }
                  patch({ title: e.target.value });
                }}
                className="select-ink w-full text-sm"
              >
                <option value="">Select a role…</option>
                {TITLE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="__custom__">Custom…</option>
              </select>
            </div>
          )}
          {customTitle && (
            <button
              type="button"
              className="mt-1 text-[11px] text-aurora-300 hover:underline"
              onClick={() => {
                setCustomTitle(false);
                patch({ title: "" });
              }}
            >
              Use dropdown
            </button>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-mist-500">Company</span>
          <input
            value={profile.company}
            onChange={(e) => patch({ company: e.target.value })}
            placeholder={DEFAULT_COMPANY}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
          />
        </label>
      </div>
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
        <p className="mt-1.5 text-[11px] text-mist-500">
          Ends every draft — name, role | company, and site.
        </p>
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

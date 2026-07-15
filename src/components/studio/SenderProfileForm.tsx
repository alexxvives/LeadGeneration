"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadSenderProfile,
  saveSenderProfile,
  SIGNATURE_PLACEHOLDER,
  type SenderProfile,
} from "@/lib/sender-profile";
import { Spinner } from "@/components/ui";
import { SparkIcon } from "@/components/icons";

/**
 * Editable outreach voice fields (local to this browser). Used to prefill
 * search offer notes and the multi-line email sign-off.
 * Saves automatically when a field loses focus.
 */
export function SenderProfileForm() {
  const [profile, setProfile] = useState<SenderProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [website, setWebsite] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const p = loadSenderProfile();
    if (!p.signature.trim()) p.signature = SIGNATURE_PLACEHOLDER;
    setProfile(p);
    setWebsite(p.website || "");
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  if (!profile) {
    return (
      <div className="rounded-xl2 border border-white/10 p-5 text-sm text-mist-500">
        Loading profile…
      </div>
    );
  }

  const flashSaved = () => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  };

  const persist = (next: SenderProfile) => {
    saveSenderProfile(next);
    setProfile(next);
    flashSaved();
  };

  const patch = (partial: Partial<SenderProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...partial } : prev));
    setSaved(false);
  };

  const saveOnBlur = () => {
    const next = {
      ...profile,
      website: website.trim(),
      signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
    };
    persist(next);
  };

  const generatePitch = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/ai/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: website.trim(),
          companyName: profile.company || undefined,
        }),
      });
      const data = (await res.json()) as { pitch?: string; error?: string };
      if (!res.ok) {
        setGenError(data.error ?? "Could not generate pitch");
        return;
      }
      if (data.pitch) {
        const next = {
          ...profile,
          defaultOffer: data.pitch,
          website: website.trim(),
          signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
        };
        persist(next);
      }
    } catch {
      setGenError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl2 border border-white/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-mist-300">
          Pitch notes and sign-off for drafts. Your display name is set under Sending
          identity. Stored in this browser only — saves when you leave a field.
        </p>
        {saved && (
          <span className="shrink-0 text-sm font-medium text-aurora-300">Saved</span>
        )}
      </div>
      <label className="block">
        <span className="text-xs font-medium text-mist-500">Your website (for AI pitch)</span>
        <input
          value={website}
          onChange={(e) => {
            setWebsite(e.target.value);
            setSaved(false);
          }}
          onBlur={saveOnBlur}
          placeholder="https://yourcompany.com"
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
        />
      </label>
      <label className="block">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-mist-500">Default offer / pitch</span>
          <button
            type="button"
            disabled={generating || website.trim().length < 3}
            onClick={() => void generatePitch()}
            className="inline-flex items-center gap-1 text-[11px] text-aurora-300 hover:underline disabled:opacity-40"
          >
            {generating ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate from website"}
          </button>
        </div>
        <textarea
          value={profile.defaultOffer}
          onChange={(e) => patch({ defaultOffer: e.target.value })}
          onBlur={saveOnBlur}
          rows={3}
          placeholder="We help clinics turn website visitors into booked appointments…"
          className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
        />
        {genError && <p className="mt-1.5 text-xs text-rose-300">{genError}</p>}
      </label>
      <label className="block">
        <span className="text-xs font-medium text-mist-500">Email sign-off</span>
        <textarea
          value={profile.signature}
          onChange={(e) => patch({ signature: e.target.value })}
          onBlur={saveOnBlur}
          rows={4}
          placeholder={SIGNATURE_PLACEHOLDER}
          className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 font-sans text-sm leading-relaxed text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
        />
      </label>
    </div>
  );
}

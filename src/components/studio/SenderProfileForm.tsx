"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadSenderProfile,
  saveSenderProfile,
  SIGNATURE_PLACEHOLDER,
  type SenderProfile,
} from "@/lib/sender-profile";
import { Spinner } from "@/components/ui";
import { HelpIcon, SparkIcon } from "@/components/icons";

/**
 * Editable outreach voice fields (local to this browser). Used to prefill
 * search offer notes, subject templates, and the multi-line email sign-off.
 * Saves automatically when a field loses focus.
 */
export function SenderProfileForm() {
  const [profile, setProfile] = useState<SenderProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [websitePrompt, setWebsitePrompt] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genProvider, setGenProvider] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const p = loadSenderProfile();
    if (!p.signature.trim()) p.signature = SIGNATURE_PLACEHOLDER;
    setProfile(p);
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
      signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
      subjectTemplate: profile.subjectTemplate.trim(),
    };
    persist(next);
  };

  const providerLabel = (p: string) => {
    if (p === "workers-ai") return "Workers AI";
    if (p === "groq") return "Groq";
    if (p === "gemini") return "Gemini";
    return p;
  };

  const generatePitch = async (site: string) => {
    setGenerating(true);
    setGenError(null);
    setGenProvider(null);
    try {
      const res = await fetch("/api/ai/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: site.trim(),
          companyName: profile.company || undefined,
        }),
      });
      const data = (await res.json()) as {
        pitch?: string;
        provider?: string;
        error?: string;
      };
      if (!res.ok) {
        setGenError(data.error ?? "Could not generate pitch");
        return;
      }
      if (data.pitch) {
        if (data.provider) setGenProvider(data.provider);
        const next = {
          ...profile,
          defaultOffer: data.pitch,
          website: site.trim(),
          signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
        };
        persist(next);
        setWebsitePrompt(false);
        setWebsiteDraft("");
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
          Subject template, pitch notes, and sign-off for drafts. Your display name is
          set under Sending identity. Stored in this browser only — saves when you leave
          a field.
        </p>
        {saved && (
          <span className="shrink-0 text-sm font-medium text-aurora-300">Saved</span>
        )}
      </div>

      <label className="block">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-xs font-medium text-mist-500">Email subject template</span>
          <span
            className="group relative inline-flex"
            title='Use variables like {lead_name}, {company}, or {location} — e.g. Propuesta para {lead_name}'
          >
            <HelpIcon className="h-3.5 w-3.5 text-mist-500 transition-colors group-hover:text-mist-300" />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-ink-900 px-2.5 py-2 text-[11px] leading-snug text-mist-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              Insert variables with curly braces:{" "}
              <code className="text-aurora-300">{"{lead_name}"}</code>,{" "}
              <code className="text-aurora-300">{"{company}"}</code>,{" "}
              <code className="text-aurora-300">{"{location}"}</code>. Example:{" "}
              <span className="text-mist-100">Propuesta para {"{lead_name}"}</span>
            </span>
          </span>
        </div>
        <input
          value={profile.subjectTemplate}
          onChange={(e) => patch({ subjectTemplate: e.target.value })}
          onBlur={saveOnBlur}
          placeholder='Propuesta para {lead_name}'
          className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
        />
      </label>

      <label className="block">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-mist-500">Default offer / pitch</span>
          <button
            type="button"
            disabled={generating}
            onClick={() => {
              setWebsitePrompt(true);
              setGenError(null);
              setWebsiteDraft(profile.website || "");
            }}
            className="inline-flex items-center gap-1 text-[11px] text-aurora-300 hover:underline disabled:opacity-40"
          >
            {generating ? <Spinner className="h-3 w-3" /> : <SparkIcon className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate from website"}
          </button>
        </div>
        {websitePrompt && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-aurora-400/20 bg-aurora-400/5 p-2.5">
            <input
              value={websiteDraft}
              onChange={(e) => setWebsiteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && websiteDraft.trim().length >= 3) {
                  void generatePitch(websiteDraft);
                }
              }}
              placeholder="https://yourcompany.com"
              autoFocus
              className="min-w-[12rem] flex-1 rounded-md border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
            />
            <button
              type="button"
              disabled={generating || websiteDraft.trim().length < 3}
              onClick={() => void generatePitch(websiteDraft)}
              className="rounded-full bg-aurora-400 px-3 py-1.5 text-xs font-medium text-ink-950 disabled:opacity-50"
            >
              Generate
            </button>
            <button
              type="button"
              onClick={() => {
                setWebsitePrompt(false);
                setWebsiteDraft("");
              }}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-mist-400 hover:text-mist-200"
            >
              Cancel
            </button>
          </div>
        )}
        <textarea
          value={profile.defaultOffer}
          onChange={(e) => patch({ defaultOffer: e.target.value })}
          onBlur={saveOnBlur}
          rows={3}
          placeholder="We help clinics turn website visitors into booked appointments…"
          className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
        />
        {genProvider && !genError && (
          <p className="mt-1.5 text-xs text-mist-500">
            Generated with{" "}
            <span className="text-mist-300">{providerLabel(genProvider)}</span>
          </p>
        )}
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

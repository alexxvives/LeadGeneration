"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadSenderProfile,
  saveSenderProfile,
  SIGNATURE_PLACEHOLDER,
  type SenderProfile,
} from "@/lib/sender-profile";
import { generateDraft } from "@/lib/outreach/draft";
import {
  langLabel,
  outreachLangFromText,
  type OutreachLang,
} from "@/lib/outreach/locale";
import type { Lead, Run } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { HelpIcon, SparkIcon } from "@/components/icons";

const EXAMPLE_COMPANY = "Bright Dental";
const EXAMPLE_NAME = "Maria";
const EXAMPLE_HOST = "brightdental.com";

const PREVIEW_LANGS: { id: OutreachLang; flag: string }[] = [
  { id: "en", flag: "🇬🇧" },
  { id: "es", flag: "🇪🇸" },
  { id: "fr", flag: "🇫🇷" },
  { id: "it", flag: "🇮🇹" },
  { id: "pt", flag: "🇵🇹" },
  { id: "pl", flag: "🇵🇱" },
  { id: "de", flag: "🇩🇪" },
];

const PREVIEW_LEAD: Lead = {
  id: "preview",
  workspaceId: "preview",
  boardId: "preview",
  runId: "preview",
  company: EXAMPLE_COMPANY,
  website: `https://${EXAMPLE_HOST}`,
  contactName: EXAMPLE_NAME,
  emails: [],
  phones: [],
  location: "Austin, TX",
  aboutBlurb: null,
  tags: [],
  fitScore: 80,
  fitReasons: [],
  sourceUrl: `https://${EXAMPLE_HOST}`,
  status: "new",
  crmStage: "new",
  contactMethod: null,
  notes: null,
  followUps: [],
  customFields: {},
  createdAt: new Date(0).toISOString(),
};

const PREVIEW_RUN: Run = {
  id: "preview",
  workspaceId: "preview",
  boardId: "preview",
  niche: "dental clinics",
  location: "Austin, TX",
  offerNotes: null,
  senderName: null,
  status: "complete",
  mode: "demo",
  provider: "demo",
  leadCount: 1,
  error: null,
  createdAt: new Date(0).toISOString(),
  completedAt: new Date(0).toISOString(),
};

function previewDraft(
  profile: SenderProfile,
  lang: OutreachLang,
): { subject: string; body: string; pitchSubstituted: boolean } {
  const pitch = profile.defaultOffer.trim();
  const pitchLang = pitch ? outreachLangFromText(pitch) : lang;
  // Avoid mixed-language previews: if saved pitch ≠ selected lang, show
  // localized sample pitch instead of splicing languages together.
  const pitchSubstituted = Boolean(pitch) && pitchLang !== lang;
  const subjectTpl = profile.subjectTemplate.trim();
  const subjectLang = subjectTpl ? outreachLangFromText(subjectTpl) : lang;
  // Custom subject templates are written in one language — use locale default
  // when previewing another language so the whole email stays consistent.
  const useSubjectTpl = Boolean(subjectTpl) && subjectLang === lang;

  const draft = generateDraft(PREVIEW_LEAD, PREVIEW_RUN, {
    forceLang: lang,
    signOff: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
    offerNotes: pitchSubstituted ? null : pitch || null,
    subjectTemplate: useSubjectTpl ? subjectTpl : null,
  });
  return { ...draft, pitchSubstituted };
}

type SavedField = "subject" | "pitch" | "signOff" | null;

/**
 * Editable outreach voice fields (local to this browser). Used to prefill
 * search offer notes, subject templates, and the multi-line email sign-off.
 * Saves automatically when a field loses focus.
 */
export function SenderProfileForm() {
  const [profile, setProfile] = useState<SenderProfile | null>(null);
  const [savedField, setSavedField] = useState<SavedField>(null);
  const [previewLang, setPreviewLang] = useState<OutreachLang>("en");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [websitePrompt, setWebsitePrompt] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genProvider, setGenProvider] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerRef = useRef<HTMLTextAreaElement | null>(null);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const lastEdited = useRef<SavedField>(null);

  const growOffer = () => {
    const el = offerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 84)}px`;
  };

  useEffect(() => {
    const p = loadSenderProfile();
    if (!p.signature.trim()) p.signature = SIGNATURE_PLACEHOLDER;
    setProfile(p);
  }, []);

  useEffect(() => {
    growOffer();
  }, [profile?.defaultOffer]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!langMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [langMenuOpen]);

  const preview = useMemo(
    () => (profile ? previewDraft(profile, previewLang) : null),
    [profile, previewLang],
  );

  if (!profile) {
    return (
      <div className="rounded-xl2 border border-white/10 p-5 text-sm text-mist-500">
        Loading profile…
      </div>
    );
  }

  const flashSaved = (field: SavedField) => {
    setSavedField(field);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedField(null), 2000);
  };

  const persist = (next: SenderProfile, field: SavedField) => {
    saveSenderProfile(next);
    setProfile(next);
    flashSaved(field);
  };

  const patch = (partial: Partial<SenderProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...partial } : prev));
    setSavedField(null);
  };

  const saveOnBlur = (field: SavedField) => {
    const next = {
      ...profile,
      signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
      subjectTemplate: profile.subjectTemplate.trim(),
    };
    persist(next, field ?? lastEdited.current);
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
        persist(next, "pitch");
        setWebsitePrompt(false);
        setWebsiteDraft("");
      }
    } catch {
      setGenError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const activeFlag =
    PREVIEW_LANGS.find((l) => l.id === previewLang)?.flag ?? "🇬🇧";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl2 border border-white/10 p-5">
        <label className="block">
          <div className="relative mb-1.5 flex items-center gap-1.5">
            <span className="text-xs font-medium text-mist-500">Email subject template</span>
            <span
              className="group relative inline-flex"
              title='Use variables like {company}, {lead_name}, or {location} — e.g. Quick note for {company}'
            >
              <HelpIcon className="h-3.5 w-3.5 text-mist-500 transition-colors group-hover:text-mist-300" />
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-ink-900 px-2.5 py-2 text-[11px] leading-snug text-mist-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                Insert variables with curly braces:{" "}
                <code className="text-aurora-300">{"{company}"}</code>,{" "}
                <code className="text-aurora-300">{"{lead_name}"}</code>,{" "}
                <code className="text-aurora-300">{"{location}"}</code>. Example:{" "}
                <span className="text-mist-100">Quick note for {"{company}"}</span>
              </span>
            </span>
            <span
              aria-live="polite"
              className={`pointer-events-none absolute left-full ml-2 text-xs font-medium text-aurora-300 transition-opacity ${
                savedField === "subject" ? "opacity-100" : "opacity-0"
              }`}
            >
              Saved
            </span>
          </div>
          <input
            value={profile.subjectTemplate}
            onChange={(e) => {
              lastEdited.current = "subject";
              patch({ subjectTemplate: e.target.value });
            }}
            onBlur={() => saveOnBlur("subject")}
            placeholder="Quick note for {company}"
            className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
          />
        </label>

        <label className="block">
          <div className="relative mb-1.5 flex items-center justify-between gap-2">
            <span className="relative text-xs font-medium text-mist-500">
              Sales pitch
              <span
                aria-live="polite"
                className={`pointer-events-none absolute left-full top-0 ml-2 whitespace-nowrap text-xs font-medium text-aurora-300 transition-opacity ${
                  savedField === "pitch" ? "opacity-100" : "opacity-0"
                }`}
              >
                Saved
              </span>
            </span>
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
            ref={offerRef}
            value={profile.defaultOffer}
            onChange={(e) => {
              lastEdited.current = "pitch";
              patch({ defaultOffer: e.target.value });
              requestAnimationFrame(growOffer);
            }}
            onBlur={() => saveOnBlur("pitch")}
            rows={3}
            placeholder="We help clinics turn website visitors into booked appointments…"
            className="w-full resize-none overflow-hidden rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
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
          <div className="relative mb-1.5">
            <span className="relative text-xs font-medium text-mist-500">
              Email sign-off
              <span
                aria-live="polite"
                className={`pointer-events-none absolute left-full top-0 ml-2 whitespace-nowrap text-xs font-medium text-aurora-300 transition-opacity ${
                  savedField === "signOff" ? "opacity-100" : "opacity-0"
                }`}
              >
                Saved
              </span>
            </span>
          </div>
          <textarea
            value={profile.signature}
            onChange={(e) => {
              lastEdited.current = "signOff";
              patch({ signature: e.target.value });
            }}
            onBlur={() => saveOnBlur("signOff")}
            rows={4}
            placeholder={SIGNATURE_PLACEHOLDER}
            className="w-full resize-y rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 font-sans text-sm leading-relaxed text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60"
          />
        </label>
      </div>

      {preview ? (
        <div className="relative rounded-xl2 border border-white/10 bg-ink-900/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] uppercase tracking-wider text-mist-500">
              Preview · example to {EXAMPLE_COMPANY}
              <span className="ml-1.5 normal-case tracking-normal text-mist-600">
                · {langLabel(previewLang)}
              </span>
            </p>
            <div ref={langMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setLangMenuOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-ink-950/50 text-base transition-colors hover:border-aurora-400/40 hover:bg-ink-900"
                aria-label={`Preview language: ${langLabel(previewLang)}`}
                aria-expanded={langMenuOpen}
                aria-haspopup="listbox"
                title="Preview in other languages"
              >
                <span aria-hidden>{activeFlag}</span>
              </button>
              {langMenuOpen ? (
                <ul
                  role="listbox"
                  className="absolute right-0 z-30 mt-1.5 min-w-[10rem] overflow-hidden rounded-xl border border-white/10 bg-ink-900 py-1 shadow-xl"
                >
                  {PREVIEW_LANGS.map((l) => (
                    <li key={l.id} role="option" aria-selected={previewLang === l.id}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                          previewLang === l.id
                            ? "bg-aurora-400/10 text-aurora-300"
                            : "text-mist-200 hover:bg-white/5"
                        }`}
                        onClick={() => {
                          setPreviewLang(l.id);
                          setLangMenuOpen(false);
                        }}
                      >
                        <span aria-hidden>{l.flag}</span>
                        {langLabel(l.id)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-xs text-mist-500">Subject</p>
          <p className="mt-0.5 font-medium text-mist-100">{preview.subject}</p>
          <div className="mt-4 border-t border-white/5 pt-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-mist-300">
              {preview.body}
            </pre>
          </div>
          {preview.pitchSubstituted ? (
            <p className="mt-3 text-[11px] leading-relaxed text-mist-500">
              Sample pitch in {langLabel(previewLang)} — your saved pitch is in another
              language, so it isn’t mixed into this preview.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

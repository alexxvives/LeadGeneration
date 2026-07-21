"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createOutreachProfile,
  deleteOutreachProfile,
  loadOutreachProfiles,
  pitchForLang,
  primaryPitchLang,
  saveSenderProfile,
  setActiveOutreachProfile,
  subjectForLang,
  SIGNATURE_PLACEHOLDER,
  type OutreachProfile,
} from "@/lib/sender-profile";
import { generateDraft } from "@/lib/outreach/draft-preview";
import {
  langLabel,
  outreachLangFromText,
  type OutreachLang,
} from "@/lib/outreach/locale";
import { normalizePitchHtml } from "@/lib/outreach/rich-text";
import type { Lead, Run } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { ChevronDownIcon, HelpIcon, SparkIcon } from "@/components/icons";
import { PitchEditor } from "@/components/studio/PitchEditor";
import {
  PlaceholderInput,
  PlaceholderTextarea,
} from "@/components/studio/PlaceholderText";

const EXAMPLE_COMPANY = "Bright Dental";
const EXAMPLE_NAME = "Maria";
const EXAMPLE_HOST = "brightdental.com";

/** ISO 3166-1 alpha-2 for flagcdn (Windows-safe — emoji flags render as GB/ES). */
const PREVIEW_LANGS: { id: OutreachLang; cc: string }[] = [
  { id: "en", cc: "gb" },
  { id: "es", cc: "es" },
  { id: "fr", cc: "fr" },
  { id: "it", cc: "it" },
  { id: "pt", cc: "pt" },
  { id: "pl", cc: "pl" },
  { id: "de", cc: "de" },
];

function FlagImg({ cc, className = "h-4 w-5" }: { cc: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${cc}.png`}
      alt=""
      width={20}
      height={15}
      className={`${className} rounded-[2px] object-cover`}
      loading="lazy"
      decoding="async"
    />
  );
}

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
  companyType: null,
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
  profile: OutreachProfile,
  lang: OutreachLang,
): { subject: string; body: string; missingPitch: boolean } {
  const pitch = (profile.pitches[lang] ?? "").trim();
  const missingPitch = !pitch;
  if (missingPitch) {
    return { subject: "", body: "", missingPitch: true };
  }
  const subjectTpl = subjectForLang(profile, lang);
  const draft = generateDraft(PREVIEW_LEAD, PREVIEW_RUN, {
    forceLang: lang,
    signOff: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
    offerNotes: pitch,
    subjectTemplate: subjectTpl || null,
    aiPersonalize: false,
    staticBody: true,
  });
  return { ...draft, missingPitch: false };
}

type SavedField = "subject" | "pitch" | "signOff" | null;

/**
 * List of outreach profiles; each holds pitch versions per language.
 * Saves on blur only when the value actually changed.
 */
export function SenderProfileForm() {
  const [profiles, setProfiles] = useState<OutreachProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<SavedField>(null);
  const [previewLang, setPreviewLang] = useState<OutreachLang>("en");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [websitePrompt, setWebsitePrompt] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genProvider, setGenProvider] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const focusSnapshot = useRef<string | null>(null);

  const profile = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;

  const reload = () => {
    const store = loadOutreachProfiles();
    setProfiles(store.profiles);
    setActiveId(store.activeId);
  };

  useEffect(() => {
    reload();
  }, []);

  // Open the flag that already has a body (any language — not English-only).
  useEffect(() => {
    if (!profile) return;
    const primary = primaryPitchLang(profile);
    if (primary) setPreviewLang(primary);
    // Only when switching profiles — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!langMenuOpen && !profileMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [langMenuOpen, profileMenuOpen]);

  const preview = useMemo(
    () => (profile ? previewDraft(profile, previewLang) : null),
    [profile, previewLang],
  );

  if (!profile) {
    return (
      <div className="rounded-xl2 border border-white/10 p-5 text-sm text-mist-500">
        Loading profiles…
      </div>
    );
  }

  const flashSaved = (field: SavedField) => {
    setSavedField(field);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedField(null), 2000);
  };

  const persist = (next: OutreachProfile, field: SavedField) => {
    saveSenderProfile(next);
    setProfiles((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    setActiveId(next.id);
    if (field) flashSaved(field);
  };

  const patch = (partial: Partial<OutreachProfile>) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, ...partial } : p)),
    );
    setSavedField(null);
  };

  const pitchValue = profile.pitches[previewLang] ?? "";

  const subjectValue =
    profile.subjects[previewLang] ?? profile.subjectTemplate ?? "";

  const fieldSnapshot = () =>
    JSON.stringify({
      subject: subjectValue.trim(),
      signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
      pitch: (profile.pitches[previewLang] ?? "").trim(),
      name: profile.name.trim(),
    });

  const saveOnBlur = (field: SavedField) => {
    let lang = previewLang;
    const pitchHtml = (profile.pitches[previewLang] ?? "").trim();
    const pitches: OutreachProfile["pitches"] = {
      ...profile.pitches,
      [previewLang]: pitchHtml,
    };
    const subjects: OutreachProfile["subjects"] = {
      ...profile.subjects,
      [previewLang]: subjectValue.trim(),
    };

    // If the body is clearly another language and that slot is empty, move it
    // so drafts/translate use the right flag (English is not required).
    if (field === "pitch" && pitchHtml) {
      const plain = pitchHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (plain.length >= 40) {
        const detected = outreachLangFromText(plain);
        if (detected !== previewLang && !pitches[detected]?.trim()) {
          pitches[detected] = pitchHtml;
          pitches[previewLang] = "";
          if (subjects[previewLang]?.trim() && !subjects[detected]?.trim()) {
            subjects[detected] = subjects[previewLang] ?? "";
            subjects[previewLang] = "";
          }
          lang = detected;
          setPreviewLang(detected);
        }
      }
    }

    const next: OutreachProfile = {
      ...profile,
      signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
      subjects,
      subjectTemplate: subjectValue.trim() || profile.subjectTemplate.trim(),
      pitches,
    };
    const serialized = JSON.stringify({
      subject: next.subjects[lang] ?? "",
      signature: next.signature,
      pitch: next.pitches[lang] ?? "",
      name: next.name.trim(),
    });
    if (focusSnapshot.current !== null && focusSnapshot.current === serialized) {
      return;
    }
    persist(next, field);
  };

  const switchPreviewLang = async (lang: OutreachLang) => {
    setLangMenuOpen(false);
    setSavedField(null);
    setTranslateError(null);

    const hasPitch = Boolean(profile.pitches[lang]?.trim());
    const hasSubject = Boolean(profile.subjects[lang]?.trim());
    // Keep current editor/preview text until the new language is ready.
    if (hasPitch && hasSubject) {
      setPreviewLang(lang);
      return;
    }

    const sourceLang = primaryPitchLang(profile);
    if (!sourceLang || sourceLang === lang) {
      setPreviewLang(lang);
      return;
    }
    const sourcePitch = pitchForLang(profile, sourceLang);
    const sourceSubject = subjectForLang(profile, sourceLang);
    if (!sourcePitch.trim() && !sourceSubject.trim()) {
      setPreviewLang(lang);
      return;
    }

    setTranslating(true);
    try {
      let nextPitch = profile.pitches[lang] ?? "";
      let nextSubject = profile.subjects[lang] ?? "";
      if (!hasPitch && sourcePitch.trim()) {
        const res = await fetch("/api/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: sourcePitch,
            targetLang: lang,
            kind: "body",
          }),
        });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !data.text) {
          setTranslateError(
            data.error ??
              `Could not translate into ${langLabel(lang)} — paste or write that version.`,
          );
          return;
        }
        nextPitch = data.text;
      }
      if (!profile.subjects[lang]?.trim() && sourceSubject.trim()) {
        const res = await fetch("/api/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: sourceSubject,
            targetLang: lang,
            kind: "subject",
          }),
        });
        const data = (await res.json()) as { text?: string; error?: string };
        if (res.ok && data.text) nextSubject = data.text;
      }
      const next: OutreachProfile = {
        ...profile,
        pitches: { ...profile.pitches, [lang]: nextPitch },
        subjects: {
          ...profile.subjects,
          ...(nextSubject.trim() ? { [lang]: nextSubject.trim() } : {}),
        },
      };
      persist(next, "pitch");
      setPreviewLang(lang);
    } catch {
      setTranslateError("Network error while translating");
    } finally {
      setTranslating(false);
    }
  };

  const captureFocus = () => {
    focusSnapshot.current = fieldSnapshot();
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
        const next: OutreachProfile = {
          ...profile,
          website: site.trim(),
          signature: profile.signature.trim() || SIGNATURE_PLACEHOLDER,
          pitches: { ...profile.pitches, [previewLang]: data.pitch },
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

  const activeCc =
    PREVIEW_LANGS.find((l) => l.id === previewLang)?.cc ?? "gb";

  const SavedHint = ({ field }: { field: SavedField }) => (
    <span
      aria-live="polite"
      className={`text-xs font-medium text-aurora-300 transition-opacity ${
        savedField === field ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      Saved
    </span>
  );

  const PlaceholderHelp = () => (
    <span
      className="group relative inline-flex"
      title="{company}, {lead_name}, {location}"
    >
      <HelpIcon className="h-3.5 w-3.5 text-mist-500 transition-colors group-hover:text-mist-300" />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-ink-900 px-2.5 py-2 text-[11px] leading-snug text-mist-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        Placeholders are replaced per lead:{" "}
        <code className="text-aurora-300">{"{company}"}</code>,{" "}
        <code className="text-aurora-300">{"{lead_name}"}</code>,{" "}
        <code className="text-aurora-300">{"{location}"}</code>.
      </span>
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div ref={profileMenuRef} className="relative min-w-[14rem] flex-1">
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-ink-900/60 focus-within:border-aurora-400/60">
            <input
              value={profile.name}
              onChange={(e) => patch({ name: e.target.value })}
              onFocus={captureFocus}
              onBlur={() => {
                const name = profile.name.trim() || "Untitled";
                const next = { ...profile, name };
                const prev = loadOutreachProfiles().profiles.find(
                  (p) => p.id === profile.id,
                );
                if (prev && prev.name === name) return;
                persist(next, null);
              }}
              aria-label="Outreach profile name"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-mist-100 outline-none"
            />
            <button
              type="button"
              onClick={() => setProfileMenuOpen((o) => !o)}
              aria-label="Switch outreach profile"
              aria-expanded={profileMenuOpen}
              aria-haspopup="listbox"
              className="shrink-0 border-l border-white/10 px-2.5 text-mist-400 transition-colors hover:bg-white/5 hover:text-mist-100"
            >
              <ChevronDownIcon
                className={`h-3.5 w-3.5 transition-transform ${
                  profileMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
          {profileMenuOpen ? (
            <ul
              role="listbox"
              className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-ink-900 py-1 shadow-xl"
            >
              {profiles.map((p) => (
                <li key={p.id} role="option" aria-selected={p.id === profile.id}>
                  <button
                    type="button"
                    className={`flex w-full px-3 py-2 text-left text-sm ${
                      p.id === profile.id
                        ? "bg-aurora-400/10 text-aurora-300"
                        : "text-mist-200 hover:bg-white/5"
                    }`}
                    onClick={() => {
                      setActiveOutreachProfile(p.id);
                      setActiveId(p.id);
                      setSavedField(null);
                      setProfileMenuOpen(false);
                    }}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            const created = createOutreachProfile();
            reload();
            setActiveId(created.id);
          }}
          className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs font-medium text-mist-100 hover:border-aurora-400/50 hover:text-aurora-300"
        >
          New profile
        </button>
        {profiles.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              if (!confirm(`Delete profile “${profile.name}”?`)) return;
              deleteOutreachProfile(profile.id);
              reload();
            }}
            className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:border-rose-400 hover:bg-rose-500/15"
          >
            Delete
          </button>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl2 border border-white/10 p-5">
          <label className="block">
            <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-medium text-mist-500">
                Email subject template
              </span>
              <PlaceholderHelp />
              <SavedHint field="subject" />
            </div>
            <PlaceholderInput
              value={subjectValue}
              onFocus={captureFocus}
              onChange={(e) =>
                patch({
                  subjects: { ...profile.subjects, [previewLang]: e.target.value },
                  subjectTemplate: e.target.value,
                })
              }
              onBlur={() => saveOnBlur("subject")}
              placeholder="Quick note for {company}"
              className="w-full rounded-lg border border-white/10 bg-ink-900/60 outline-none focus-within:border-aurora-400/60"
            />
          </label>

          <div className="block">
            <div className="mb-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-mist-500">
                Email body template
                <PlaceholderHelp />
                <SavedHint field="pitch" />
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
                {generating ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <SparkIcon className="h-3.5 w-3.5" />
                )}
                {generating ? "Generating…" : "Generate from website"}
              </button>
            </div>
            {websitePrompt ? (
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
                  className="rounded-full bg-aurora-400 px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
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
            ) : null}
            <PitchEditor
              value={pitchValue}
              onFocus={captureFocus}
              onChange={(html) => {
                patch({
                  pitches: { ...profile.pitches, [previewLang]: html },
                });
              }}
              onBlur={() => saveOnBlur("pitch")}
              placeholder="Write your email body…"
            />
            {genProvider && !genError && (
              <p className="mt-1.5 text-xs text-mist-500">
                Generated with{" "}
                <span className="text-mist-300">{providerLabel(genProvider)}</span>
              </p>
            )}
            {genError && <p className="mt-1.5 text-xs text-rose-300">{genError}</p>}
            {translateError && (
              <p className="mt-1.5 text-xs text-amber-200/90">{translateError}</p>
            )}
          </div>

          <label className="block">
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-medium text-mist-500">
                Email sign-off template
              </span>
              <PlaceholderHelp />
              <SavedHint field="signOff" />
            </div>
            <PlaceholderTextarea
              value={profile.signature}
              onFocus={captureFocus}
              onChange={(e) => patch({ signature: e.target.value })}
              onBlur={() => saveOnBlur("signOff")}
              rows={4}
              placeholder={SIGNATURE_PLACEHOLDER}
              className="w-full rounded-lg border border-white/10 bg-ink-900/60 outline-none focus-within:border-aurora-400/60"
            />
          </label>
        </div>

        {preview ? (
          <div className="relative rounded-xl2 border border-white/10 bg-ink-900/40 p-5">
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(profile.aiPersonalize)}
              onClick={() => {
                const on = !profile.aiPersonalize;
                persist(
                  { ...profile, aiPersonalize: on, staticBody: !on },
                  null,
                );
              }}
              className={`mb-4 flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                profile.aiPersonalize
                  ? "border-aurora-400/35 bg-aurora-400/10"
                  : "border-white/10 bg-ink-950/40 hover:border-white/15 hover:bg-ink-950/60"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-mist-100">
                  AI personalize each email
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-mist-500">
                  Slightly vary wording per lead from this template
                </span>
              </span>
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  profile.aiPersonalize ? "bg-aurora-400" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink-950 shadow transition-transform ${
                    profile.aiPersonalize ? "left-5" : "left-0.5"
                  }`}
                />
              </span>
            </button>
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
                  disabled={translating}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-ink-950/50 transition-colors hover:border-aurora-400/40 hover:bg-ink-900 disabled:opacity-50"
                  aria-label={`Preview language: ${langLabel(previewLang)}`}
                  aria-expanded={langMenuOpen}
                  aria-haspopup="listbox"
                  title="Preview / translate into other languages"
                >
                  {translating ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : (
                    <FlagImg cc={activeCc} />
                  )}
                </button>
                {langMenuOpen ? (
                  <ul
                    role="listbox"
                    className="absolute right-0 z-30 mt-1.5 min-w-[10rem] overflow-hidden rounded-xl border border-white/10 bg-ink-900 py-1 shadow-xl"
                  >
                    {PREVIEW_LANGS.map((l) => {
                      const has = Boolean(profile.pitches[l.id]?.trim());
                      return (
                        <li
                          key={l.id}
                          role="option"
                          aria-selected={previewLang === l.id}
                        >
                          <button
                            type="button"
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                              previewLang === l.id
                                ? "bg-aurora-400/10 text-aurora-300"
                                : "text-mist-200 hover:bg-white/5"
                            }`}
                            onClick={() => void switchPreviewLang(l.id)}
                          >
                            <FlagImg cc={l.cc} />
                            <span className="flex-1">{langLabel(l.id)}</span>
                            {has ? (
                              <span className="text-[10px] text-aurora-400/80">●</span>
                            ) : (
                              <span className="text-[10px] text-mist-600">○</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </div>
            {translating ? (
              <p className="mt-3 text-xs text-aurora-200/90">
                Translating into {langLabel(previewLang)}…
              </p>
            ) : null}
            {preview.missingPitch && !translating ? (
              <p className="mt-8 text-center text-sm text-mist-500">
                Preview will appear when the template is filled.
              </p>
            ) : (
              <>
                <p className="mt-3 text-xs text-mist-500">Subject</p>
                <p className="mt-0.5 font-medium text-mist-100">{preview.subject}</p>
                <div className="mt-4 border-t border-white/5 pt-4">
                  <div
                    className="pitch-preview font-sans text-sm leading-relaxed text-mist-300 [&_b]:font-semibold [&_strong]:font-semibold [&_em]:italic [&_i]:italic [&_u]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5"
                    dangerouslySetInnerHTML={{
                      __html: normalizePitchHtml(preview.body),
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

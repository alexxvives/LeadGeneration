"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, ArrowIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import type { SearchStrategy } from "@/lib/types";
import { loadSenderProfile } from "@/lib/sender-profile";
import { api } from "@/lib/client-api";
import type { LocationSuggestion } from "@/app/api/geocode/route";

export interface SearchValues {
  niche: string;
  location: string;
  senderName: string;
  searchStrategy: SearchStrategy;
}

const STRATEGIES: {
  id: SearchStrategy;
  label: string;
  summary: string;
  detail: string;
  credits: string;
  bestFor: string;
}[] = [
  {
    id: "standard",
    label: "Standard",
    summary: "One focused query — fastest path from ICP to a shortlist.",
    detail:
      'Runs a single search like "[niche] [location] contact email". Best when you already know the niche and just want a first pass of websites with contact hints. Lowest provider usage (~1 credit unit per run).',
    credits: "~1× credits",
    bestFor: "Quick tests, narrow niches, demo runs",
  },
  {
    id: "smart",
    label: "Smart",
    summary: "Expands your ICP into several queries, merges results, ranks by fit.",
    detail:
      "Builds multiple query variants (contact email, official website, top/best lists), runs them sequentially, dedupes by domain, then sorts by Lodestar's transparent fit score. Higher recall for vague or competitive niches.",
    credits: "~3× credits",
    bestFor: "Competitive markets, vague ICPs, quality over speed",
  },
];

// ─── Location autocomplete combobox ──────────────────────────────────────────

function LocationCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep internal input in sync when parent resets.
  useEffect(() => { setInputValue(value); }, [value]);

  // Close dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInput = (raw: string) => {
    setInputValue(raw);
    onChange(raw); // keep parent in sync with freetext too
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (raw.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { suggestions: s } = await api.suggestLocations(raw);
        setSuggestions(s);
        setOpen(s.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const pick = (s: LocationSuggestion) => {
    setInputValue(s.value);
    onChange(s.value);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          value={inputValue}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder=""
          className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60 pr-8"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner className="h-3.5 w-3.5 text-mist-500" />
          </span>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-xl">
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-mist-100 transition-colors hover:bg-white/5"
              >
                <span className="text-mist-500">📍</span>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Search panel ─────────────────────────────────────────────────────────────

export function SearchPanel({
  onSearch,
  running,
  compact = false,
}: {
  onSearch: (v: SearchValues) => void;
  running: boolean;
  compact?: boolean;
}) {
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [searchStrategy, setSearchStrategy] = useState<SearchStrategy>("standard");
  const [senderName, setSenderName] = useState("");
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    const profile = loadSenderProfile();
    setSenderName(profile.displayName);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim() || running) return;
    onSearch({ niche, location, senderName, searchStrategy });
  };

  const active = STRATEGIES.find((s) => s.id === searchStrategy) ?? STRATEGIES[0]!;

  if (compact && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-mist-100 transition-transform hover:scale-[1.02]"
      >
        <SearchIcon className="h-4 w-4 text-aurora-300" />
        New search
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="glass rounded-xl2 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <Field label="Who do you want to reach?" hint="Niche / ICP">
          <input
            autoFocus
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder=""
            className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60"
          />
        </Field>
        <Field label="Location" hint="Optional — narrows search + powers map">
          <LocationCombobox value={location} onChange={setLocation} />
        </Field>
      </div>
      <div className="mt-4">
        <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-mist-100">
          Search mode
          <span className="text-xs font-normal text-mist-500">How hard to look</span>
        </span>
        <div
          role="radiogroup"
          aria-label="Search mode"
          className="inline-flex rounded-full border border-white/10 bg-ink-900/60 p-1"
        >
          {STRATEGIES.map((s) => {
            const isActive = s.id === searchStrategy;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                title={s.summary}
                onClick={() => setSearchStrategy(s.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-aurora-400 text-ink-950"
                    : "text-mist-300 hover:text-mist-100"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
          <p className="text-sm font-medium text-mist-100">{active.summary}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-mist-400">{active.detail}</p>
          <p className="mt-2 text-[11px] uppercase tracking-wider text-mist-500">
            Best for · {active.bestFor}
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-4">
        <button
          type="submit"
          disabled={!niche.trim() || running}
          className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-ink-950 transition-all hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <>
              <Spinner className="h-4 w-4" /> Charting…
            </>
          ) : (
            <>
              Find leads
              <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </div>
    </form>
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
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-mist-100">
        {label}
        {hint && <span className="text-xs font-normal text-mist-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

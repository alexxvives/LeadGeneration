"use client";

import { useState } from "react";
import { SearchIcon, ArrowIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import type { SearchStrategy } from "@/lib/types";

export interface SearchValues {
  niche: string;
  location: string;
  offerNotes: string;
  searchStrategy: SearchStrategy;
}

const STRATEGIES: { id: SearchStrategy; label: string; hint: string }[] = [
  { id: "standard", label: "Standard", hint: "One quick query — fastest, fewest credits." },
  { id: "smart", label: "Smart", hint: "Expands your ICP into several queries and ranks the best fits. Uses more credits." },
  { id: "local", label: "Local", hint: "Tuned for brick-and-mortar / near-me businesses (directories, reviews, phone)." },
];

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
  const [offerNotes, setOfferNotes] = useState("");
  const [searchStrategy, setSearchStrategy] = useState<SearchStrategy>("standard");
  const [open, setOpen] = useState(!compact);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim() || running) return;
    onSearch({ niche, location, offerNotes, searchStrategy });
  };

  const activeHint = STRATEGIES.find((s) => s.id === searchStrategy)?.hint ?? "";

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
            placeholder="dentist clinics, indie coffee roasters, HVAC contractors…"
            className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60"
          />
        </Field>
        <Field label="Location" hint="Optional">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Austin, TX"
            className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60"
          />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Your offer / pitch notes" hint="Optional — used to personalize drafts">
          <textarea
            value={offerNotes}
            onChange={(e) => setOfferNotes(e.target.value)}
            rows={2}
            placeholder="We build booking sites that turn website visitors into scheduled appointments…"
            className="w-full resize-none rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60"
          />
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
            const active = s.id === searchStrategy;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                title={s.hint}
                onClick={() => setSearchStrategy(s.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-aurora-400 text-ink-950"
                    : "text-mist-300 hover:text-mist-100"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-xs text-mist-500">{activeHint}</p>
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

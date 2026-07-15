"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, ArrowIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import type { PlanId, SearchStrategy } from "@/lib/types";
import { FREE_MAX_LEADS_PER_RUN, LEAD_COUNT_OPTIONS } from "@/lib/plans";
import { loadSenderProfile, resolveSignature } from "@/lib/sender-profile";
import { deleteSavedIcp, loadSavedIcps, saveIcp } from "@/lib/saved-icps";
import type { SavedIcp } from "@/lib/types";
import { api } from "@/lib/client-api";
import type { LocationSuggestion } from "@/app/api/geocode/route";

export interface SearchValues {
  niche: string;
  location: string;
  senderName: string;
  searchStrategy: SearchStrategy;
  offerNotes: string;
  maxLeads: number;
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
  confirmed,
  onChange,
  onConfirmedChange,
}: {
  value: string;
  confirmed: boolean;
  onChange: (v: string) => void;
  onConfirmedChange: (ok: boolean) => void;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

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
    // Typing clears confirmation — must pick from the list again.
    onConfirmedChange(false);
    onChange("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (raw.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
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
    onConfirmedChange(true);
    setSuggestions([]);
    setOpen(false);
  };

  const clear = () => {
    setInputValue("");
    onChange("");
    onConfirmedChange(true); // empty location is allowed
    setSuggestions([]);
    setOpen(false);
  };

  const needsPick = inputValue.trim().length > 0 && !confirmed;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          value={inputValue}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Type a city, then pick from the list"
          className={`w-full rounded-lg border bg-ink-900/60 px-4 py-3 pr-8 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60 ${
            needsPick ? "border-amber-400/40" : "border-white/10"
          }`}
          aria-invalid={needsPick}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner className="h-3.5 w-3.5 text-mist-500" />
          </span>
        )}
        {!loading && inputValue && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs text-mist-500 hover:text-mist-200"
            aria-label="Clear location"
          >
            Clear
          </button>
        )}
      </div>

      {needsPick && (
        <p className="mt-1.5 text-xs text-amber-200/80">
          Pick a place from the suggestions so we search the right Barcelona — not a namesake elsewhere.
        </p>
      )}

      {open && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-xl">
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-mist-100 transition-colors hover:bg-white/5"
              >
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
  planId = "free",
  leadsRemaining = null,
}: {
  onSearch: (v: SearchValues) => void;
  running: boolean;
  compact?: boolean;
  /** Current plan — Free locks higher lead-count options. */
  planId?: PlanId;
  /** Remaining monthly lead credits (null = unmetered / unknown). */
  leadsRemaining?: number | null;
}) {
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [locationConfirmed, setLocationConfirmed] = useState(true);
  const [offerNotes, setOfferNotes] = useState("");
  const [searchStrategy, setSearchStrategy] = useState<SearchStrategy>("standard");
  const [senderName, setSenderName] = useState("");
  const [maxLeads, setMaxLeads] = useState(10);
  const [open, setOpen] = useState(!compact);
  const [icps, setIcps] = useState<SavedIcp[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);

  const freeTierLocked = planId === "free";
  const planCap = freeTierLocked ? FREE_MAX_LEADS_PER_RUN : Math.max(...LEAD_COUNT_OPTIONS);

  useEffect(() => {
    const profile = loadSenderProfile();
    setSenderName(resolveSignature(profile));
    setOfferNotes(profile.defaultOffer);
    setIcps(loadSavedIcps());
  }, []);

  // Clamp selection if plan/remaining credits shrink.
  useEffect(() => {
    const creditCap =
      leadsRemaining == null ? planCap : Math.max(1, Math.min(planCap, leadsRemaining));
    setMaxLeads((prev) => {
      if (prev <= creditCap) return prev;
      const opts = [...LEAD_COUNT_OPTIONS].filter((n) => n <= creditCap);
      return opts.length > 0 ? opts[opts.length - 1]! : creditCap;
    });
  }, [planCap, leadsRemaining]);

  const canSubmit =
    niche.trim().length > 0 && locationConfirmed && !running;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSearch({ niche, location, senderName, searchStrategy, offerNotes, maxLeads });
  };

  const applyIcp = (icp: SavedIcp) => {
    setNiche(icp.niche);
    setLocation(icp.location);
    setLocationConfirmed(true); // saved ICPs already used a confirmed place
    setOfferNotes(icp.offerNotes);
  };

  const handleSaveIcp = () => {
    if (!niche.trim()) return;
    saveIcp({
      name: saveName.trim() || niche.trim(),
      niche,
      location,
      offerNotes,
    });
    setIcps(loadSavedIcps());
    setSaveName("");
    setShowSave(false);
  };

  const handleDeleteIcp = (id: string) => {
    deleteSavedIcp(id);
    setIcps(loadSavedIcps());
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
    <form
      onSubmit={submit}
      className="glass rounded-xl2 p-5 sm:p-6"
      data-tour="search-panel"
    >
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
        <Field label="Location" hint="Optional — pick from suggestions">
          <LocationCombobox
            value={location}
            confirmed={locationConfirmed}
            onChange={setLocation}
            onConfirmedChange={setLocationConfirmed}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Offer / pitch notes" hint="Optional — used in drafts">
          <textarea
            value={offerNotes}
            onChange={(e) => setOfferNotes(e.target.value)}
            rows={2}
            placeholder="What you're offering and why it fits…"
            className="w-full resize-y rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-sm text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60"
          />
        </Field>
      </div>

      {(icps.length > 0 || niche.trim()) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-mist-500">
              Saved ICPs
            </p>
            {niche.trim() && (
              <button
                type="button"
                onClick={() => setShowSave((v) => !v)}
                className="text-xs font-medium text-aurora-300 hover:underline"
              >
                {showSave ? "Cancel" : "Save current"}
              </button>
            )}
          </div>
          {showSave && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Template name"
                className="min-w-[10rem] flex-1 rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm outline-none focus:border-aurora-400/60"
              />
              <button
                type="button"
                onClick={handleSaveIcp}
                className="rounded-full bg-aurora-400 px-3 py-1.5 text-xs font-medium text-ink-950"
              >
                Save
              </button>
            </div>
          )}
          {icps.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {icps.map((icp) => (
                <li key={icp.id} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-ink-900/50 pl-3 pr-1 py-1 text-xs">
                  <button
                    type="button"
                    onClick={() => applyIcp(icp)}
                    className="font-medium text-mist-100 hover:text-aurora-300"
                    title={`${icp.niche}${icp.location ? ` · ${icp.location}` : ""}`}
                  >
                    {icp.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteIcp(icp.id)}
                    className="rounded-full px-1.5 py-0.5 text-mist-500 hover:bg-white/5 hover:text-mist-200"
                    aria-label={`Delete ${icp.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-mist-500">
              Save niche + location + offer as a reusable template (stored in this browser).
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-mist-100">
            Leads to find
            <span className="text-xs font-normal text-mist-500">
              {freeTierLocked ? `Free · up to ${FREE_MAX_LEADS_PER_RUN}/run` : "Per search"}
            </span>
          </span>
          <div
            role="radiogroup"
            aria-label="Number of leads"
            className="inline-flex flex-wrap gap-1 rounded-full border border-white/10 bg-ink-900/60 p-1"
          >
            {LEAD_COUNT_OPTIONS.map((n) => {
              const locked = n > planCap;
              const overCredits =
                leadsRemaining != null && leadsRemaining > 0 && n > leadsRemaining;
              const disabled = locked || overCredits;
              const isActive = maxLeads === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={disabled}
                  title={
                    locked
                      ? "Upgrade to unlock larger batches"
                      : overCredits
                        ? `Only ${leadsRemaining} lead credit${leadsRemaining === 1 ? "" : "s"} left this month`
                        : undefined
                  }
                  onClick={() => !disabled && setMaxLeads(n)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-aurora-400 text-ink-950"
                      : disabled
                        ? "cursor-not-allowed text-mist-600 opacity-50"
                        : "text-mist-300 hover:text-mist-100"
                  }`}
                >
                  {n}
                  {locked ? (
                    <span className="ml-1 text-[10px] opacity-70">Pro</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {freeTierLocked && (
            <p className="mt-2 text-xs text-mist-500">
              Larger batches (15+) need a paid plan. Monthly Free cap is also 50 leads.
            </p>
          )}
        </div>

        <div>
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
      </div>
      <div className="mt-5 flex items-center justify-end gap-4">
        <button
          type="submit"
          disabled={!canSubmit}
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

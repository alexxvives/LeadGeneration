"use client";

import { useEffect, useState } from "react";
import {
  AGE_BAND_OPTIONS,
  effectiveAgeBand,
  loadWarmupProfile,
  recommendedDailySoftCap,
  setMailboxAgeBand,
  type MailboxAgeBand,
  type WarmupProfile,
} from "@/lib/email/warmup";

/**
 * Compact age-band dropdown for Sending identity — drives soft daily send caps.
 */
export function MailboxAgePicker({ disabled = false }: { disabled?: boolean }) {
  const [profile, setProfile] = useState<WarmupProfile | null>(null);

  useEffect(() => {
    setProfile(loadWarmupProfile());
  }, []);

  if (!profile) return null;

  const selected = profile.ageBand ?? "new";
  const effective = effectiveAgeBand(profile);
  const softCap = recommendedDailySoftCap(profile);

  const onChange = (band: MailboxAgeBand) => {
    if (disabled) return;
    setProfile(setMailboxAgeBand(band));
  };

  return (
    <div className="min-w-[10.5rem]">
      <label className="mb-1.5 block text-sm font-medium text-mist-100">
        How old is this inbox?
      </label>
      <select
        value={selected}
        disabled={disabled}
        aria-label="Mailbox age"
        onChange={(e) => onChange(e.target.value as MailboxAgeBand)}
        className="select-glass w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-3 text-sm text-mist-100 outline-none transition-colors hover:border-white/20 focus:border-aurora-400/60 disabled:opacity-50"
      >
        {AGE_BAND_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label} ({opt.hint})
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-mist-500">
        Soft warn ~{softCap}/day
        {effective !== selected ? (
          <span className="text-mist-600">
            {" "}
            · now treating as {labelFor(effective).toLowerCase()}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function labelFor(band: MailboxAgeBand): string {
  return AGE_BAND_OPTIONS.find((o) => o.id === band)?.label ?? band;
}

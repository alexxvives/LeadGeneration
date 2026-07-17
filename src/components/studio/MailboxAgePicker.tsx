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
 * Compact age band control for Sending identity — drives soft daily send caps.
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

  const pick = (band: MailboxAgeBand) => {
    if (disabled) return;
    setProfile(setMailboxAgeBand(band));
  };

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-mist-100">How old is this inbox?</p>
        <p className="text-[11px] text-mist-500">
          Soft warn ~{softCap}/day
          {effective !== selected ? (
            <span className="text-mist-600">
              {" "}
              · now treating as {labelFor(effective).toLowerCase()}
            </span>
          ) : null}
        </p>
      </div>
      <div
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
        role="radiogroup"
        aria-label="Mailbox age"
      >
        {AGE_BAND_OPTIONS.map((opt) => {
          const on = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => pick(opt.id)}
              className={`rounded-xl border px-2.5 py-2 text-left transition-colors disabled:opacity-50 ${
                on
                  ? "border-aurora-400/40 bg-aurora-400/10"
                  : "border-white/10 bg-ink-950/40 hover:border-white/20 hover:bg-ink-950/60"
              }`}
            >
              <span
                className={`block text-xs font-medium ${
                  on ? "text-aurora-200" : "text-mist-100"
                }`}
              >
                {opt.label}
              </span>
              <span className="mt-0.5 block text-[10px] text-mist-500">{opt.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-mist-600">
        We ramp the soft daily warn as this inbox ages from the date you pick. Never a hard
        block — only a caution before send.
      </p>
    </div>
  );
}

function labelFor(band: MailboxAgeBand): string {
  return AGE_BAND_OPTIONS.find((o) => o.id === band)?.label ?? band;
}

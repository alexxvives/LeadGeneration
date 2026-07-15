"use client";

import { useEffect, useState } from "react";
import { CheckIcon, XIcon } from "@/components/icons";

const STORAGE_KEY = "lodestar_domain_health_v1";

type Checks = {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  warmup: boolean;
};

const DEFAULTS: Checks = { spf: false, dkim: false, dmarc: false, warmup: false };

const ITEMS: { key: keyof Checks; label: string; hint: string }[] = [
  {
    key: "spf",
    label: "SPF record",
    hint: "DNS TXT on your sending domain authorizing Resend (or your SMTP host)",
  },
  {
    key: "dkim",
    label: "DKIM signing",
    hint: "Add the DKIM CNAMEs from the Resend domain wizard",
  },
  {
    key: "dmarc",
    label: "DMARC policy",
    hint: "Start with p=none; tighten once SPF/DKIM align",
  },
  {
    key: "warmup",
    label: "Warm-up plan",
    hint: "Ramp slowly on a secondary domain — don’t blast from day one",
  },
];

/**
 * Manual domain-health checklist (browser-local). Complements the automated
 * Ready-to-send ticks — DNS can’t be verified from the Worker without a DNS API.
 */
export function DomainHealthChecklist() {
  const [checks, setChecks] = useState<Checks>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChecks({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (key: keyof Checks) => {
    setChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl2 border border-white/10">
      <div className="border-b border-white/5 px-4 py-3">
        <p className="text-sm font-medium text-mist-100">Domain health</p>
        <p className="mt-0.5 text-xs text-mist-500">
          Tick these after you verify DNS in Resend (or your DNS host). Stored in this browser.
        </p>
      </div>
      {ITEMS.map((item, i) => {
        const on = checks[item.key];
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => toggle(item.key)}
            className={`flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-white/[0.03] ${
              i > 0 ? "border-t border-white/5" : ""
            }`}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                on ? "bg-aurora-400/15 text-aurora-300" : "bg-white/5 text-mist-500"
              }`}
            >
              {on ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-mist-100">{item.label}</span>
              <span className="block text-sm text-mist-500">{item.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

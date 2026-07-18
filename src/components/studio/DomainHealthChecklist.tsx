"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, XIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import type { DomainDnsRecord, DomainHealthResult } from "@/lib/email/domain-health";
import { readMigratedKey } from "@/lib/browser-storage";

const MANUAL_KEY = "hermes_domain_health_v1";
const MANUAL_LEGACY_KEYS = ["leadify_domain_health_v1", "lodestar_domain_health_v1"];

type ManualChecks = {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  warmup: boolean;
};

const MANUAL_DEFAULTS: ManualChecks = {
  spf: false,
  dkim: false,
  dmarc: false,
  warmup: false,
};

function statusTone(status: DomainDnsRecord["status"]) {
  switch (status) {
    case "verified":
      return "bg-aurora-400/15 text-aurora-300";
    case "failed":
      return "bg-rose-500/15 text-rose-300";
    case "pending":
      return "bg-amber-400/15 text-amber-200";
    default:
      return "bg-white/5 text-mist-500";
  }
}

/**
 * Easy Sending: live Resend DNS rows + poll, with manual fallback when
 * no API key (demo-safe). Compact mode fits inside the sending-identity card.
 */
export function DomainHealthPanel({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<DomainHealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualChecks>(MANUAL_DEFAULTS);

  useEffect(() => {
    try {
      const raw = readMigratedKey(MANUAL_KEY, MANUAL_LEGACY_KEYS);
      if (raw) setManual({ ...MANUAL_DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const poll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/providers/resend/domain-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as DomainHealthResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not check domain health");
        return;
      }
      setHealth(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void poll();
  }, [poll]);

  // Auto-poll every 30s while not fully ready (live mode only).
  useEffect(() => {
    if (!health || health.mode !== "live" || health.ready) return;
    const id = window.setInterval(() => void poll(), 30_000);
    return () => window.clearInterval(id);
  }, [health, poll]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const toggleManual = (key: keyof ManualChecks) => {
    setManual((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(MANUAL_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const showManual = !health || health.mode === "demo" || health.records.length === 0;

  if (compact) {
    const statusLabel = health?.ready
      ? "Ready to send"
      : health?.domain
        ? `DNS for ${health.domain}`
        : "Verify sending domain";
    return (
      <div className="rounded-lg border border-white/8 bg-ink-950/40 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-mist-500">
              Domain health
            </p>
            <p className="mt-0.5 text-sm text-mist-200">{statusLabel}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-mist-500">
              {health?.message ??
                "Add SPF / DKIM at your DNS host — we poll Resend until they verify."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void poll()}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-mist-200 hover:bg-white/5 disabled:opacity-50"
          >
            {loading ? <Spinner className="h-3 w-3" /> : null}
            {loading ? "Checking…" : "Poll"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        {health && health.records.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {health.records.map((r, i) => (
              <li
                key={`${r.name}-${r.type}-${i}`}
                className="flex items-center gap-2 text-[11px] text-mist-400"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  r.status === "verified" ? "bg-aurora-400" : "bg-mist-600"
                }`} />
                <span className="truncate text-mist-300">{r.record}</span>
                <span className="ml-auto shrink-0 uppercase tracking-wider text-mist-600">
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {showManual ? (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/5 pt-2">
            {(
              [
                { key: "spf" as const, label: "SPF" },
                { key: "dkim" as const, label: "DKIM" },
                { key: "dmarc" as const, label: "DMARC" },
              ] as const
            ).map(({ key, label }) => (
              <label
                key={key}
                className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-mist-400"
              >
                <input
                  type="checkbox"
                  checked={manual[key]}
                  onChange={() => toggleManual(key)}
                  className="rounded border-white/20 bg-ink-900 text-aurora-400 focus:ring-aurora-400/40"
                />
                {label}
              </label>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl2 border border-aurora-400/20 bg-aurora-400/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-aurora-300/90">
            Domain health
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-mist-100">
            {health?.ready
              ? "Ready to send"
              : health?.domain
                ? `DNS for ${health.domain}`
                : "Verify your sending domain"}
          </p>
          <p className="mt-1 max-w-xl text-sm text-mist-500">
            {health?.message ??
              "Paste the records at your registrar. We poll Resend until SPF and DKIM turn green."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void poll()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-ink-900/60 px-4 py-2 text-sm font-medium text-mist-100 transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {loading ? <Spinner className="h-4 w-4" /> : null}
          {loading ? "Checking…" : "Poll now"}
        </button>
      </div>

      {error && (
        <p className="border-b border-white/5 px-4 py-3 text-sm text-rose-300">{error}</p>
      )}

      {health && health.records.length > 0 && (
        <div className="divide-y divide-white/5">
          {health.records.map((r, i) => {
            const copyKey = `${r.name}-${r.type}-${i}`;
            return (
              <div key={copyKey} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${statusTone(r.status)}`}
                >
                  {r.status === "verified" ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <XIcon className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-mist-100">{r.record}</p>
                    <span className="text-xs uppercase tracking-wider text-mist-500">
                      {r.type}
                      {r.priority != null ? ` · pri ${r.priority}` : ""}
                    </span>
                    <span className="text-xs text-mist-500">{r.status}</span>
                  </div>
                  <CopyRow
                    label="Name"
                    value={r.name}
                    copied={copied === `${copyKey}-name`}
                    onCopy={() => void copy(`${copyKey}-name`, r.name)}
                  />
                  <CopyRow
                    label="Value"
                    value={r.value}
                    copied={copied === `${copyKey}-value`}
                    onCopy={() => void copy(`${copyKey}-value`, r.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showManual && (
        <div className="border-t border-white/5">
          <p className="px-4 pt-3 text-xs text-mist-500">
            Manual checklist (stored in this browser)
            {health?.docsUrl ? (
              <>
                {" "}
                ·{" "}
                <a
                  href={health.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-aurora-300 hover:underline"
                >
                  Resend domain docs
                </a>
              </>
            ) : null}
          </p>
          {(
            [
              { key: "spf" as const, label: "SPF record", hint: "Authorize Resend on your domain" },
              { key: "dkim" as const, label: "DKIM signing", hint: "Add Resend DKIM records" },
              {
                key: "dmarc" as const,
                label: "DMARC policy",
                hint: "Start with p=none; tighten once aligned",
              },
              {
                key: "warmup" as const,
                label: "Warm-up plan",
                hint: "Ramp slowly — don’t blast from day one",
              },
            ] as const
          ).map((item, i) => {
            const on = manual[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleManual(item.key)}
                className={`flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] ${
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
      )}
    </div>
  );
}

/** @deprecated Use DomainHealthPanel — kept as alias for any stray imports. */
export const DomainHealthChecklist = DomainHealthPanel;

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-12 shrink-0 pt-1 text-[11px] uppercase tracking-wider text-mist-600">
        {label}
      </span>
      <code className="min-w-0 flex-1 break-all rounded-lg bg-ink-950/60 px-2 py-1.5 text-xs text-mist-200">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-aurora-300 hover:bg-white/5"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

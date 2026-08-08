"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, XIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import type { DomainDnsRecord, DomainHealthResult } from "@/lib/email/domain-health";

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

type StatusItem = {
  key: string;
  label: string;
  ok: boolean;
  /** Recommended but not required for send (DMARC). */
  optional?: boolean;
  tip: string;
};

function itemsFromHealth(health: DomainHealthResult | null): StatusItem[] {
  if (health && health.records.length > 0) {
    // Resend returns two rows both named "SPF" (MX feedback + TXT). Collapse
    // compact chips to one label per record family.
    const byLabel = new Map<string, DomainDnsRecord[]>();
    for (const r of health.records) {
      const label = r.record.trim() || "DNS";
      const list = byLabel.get(label) ?? [];
      list.push(r);
      byLabel.set(label, list);
    }
    return [...byLabel.entries()].map(([label, group]) => {
      const optional = group.every((r) => r.optional === true);
      const ok = group.every((r) => r.status === "verified");
      const pending = group.find((r) => r.status !== "verified");
      const tip = ok
        ? group.length > 1
          ? `${label} verified (${group.length} DNS rows)`
          : `${label} verified`
        : optional
          ? `${label}: recommended (optional) — SPF + DKIM are enough to send. p=none is fine.`
          : pending
            ? `${label}: ${pending.status}${
                pending.value
                  ? ` — expected ${pending.type} ${pending.name}`
                  : ""
              }`
            : `${label}: pending`;
      return {
        key: label.toLowerCase(),
        label,
        ok,
        optional,
        tip,
      };
    });
  }
  // Demo / no API key / domain not registered yet — show expected checks as not ready.
  const reason =
    health?.message?.trim() ||
    (health?.mode === "demo"
      ? "Add a Resend API key and From email to check DNS live"
      : "Domain DNS not available yet — save a From email on a verified Resend domain");
  return (
    [
      { key: "spf", label: "SPF", optional: false },
      { key: "dkim", label: "DKIM", optional: false },
      {
        key: "dmarc",
        label: "DMARC",
        optional: true,
      },
    ] as const
  ).map(({ key, label, optional }) => ({
    key,
    label,
    ok: false,
    optional,
    tip: optional
      ? "Recommended (optional) — SPF + DKIM unlock sending; DMARC p=none is a monitoring bonus."
      : reason,
  }));
}

function chipTone(item: StatusItem): string {
  if (item.ok) return "bg-aurora-400/15 text-aurora-300";
  if (item.optional) return "bg-amber-400/10 text-amber-200";
  return "bg-rose-500/10 text-rose-300";
}

/**
 * Easy Sending: live Resend DNS rows (auto-check on load + every 30s until
 * ready). Status-only — green check / red cross with hover tip. Compact mode
 * fits inside the sending-identity card.
 */
export function DomainHealthPanel({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<DomainHealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  const items = itemsFromHealth(health);

  if (compact) {
    const statusLabel = health?.ready
      ? "Ready"
      : health?.domain
        ? health.domain
        : "Verify domain";
    return (
      <div className="rounded-lg border border-white/8 bg-ink-950/40 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-mist-500">
            Domain health
          </p>
          <p className="min-w-0 truncate text-xs text-mist-200">{statusLabel}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {items.map((item) => (
              <span
                key={item.key}
                title={item.tip}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${chipTone(item)}`}
              >
                {item.ok ? (
                  <CheckIcon className="h-3 w-3" aria-hidden />
                ) : item.optional ? (
                  <span className="text-[9px] font-semibold" aria-hidden>
                    ?
                  </span>
                ) : (
                  <XIcon className="h-3 w-3" aria-hidden />
                )}
                {item.label}
              </span>
            ))}
          </div>
          {loading ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-mist-500">
              <Spinner className="h-3 w-3" />
            </span>
          ) : null}
        </div>
        {error ? <p className="mt-1 text-[11px] text-rose-300">{error}</p> : null}
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
              "Paste SPF + DKIM at your registrar (required). DMARC is optional — p=none is enough if you add it."}
          </p>
        </div>
        {loading ? (
          <span className="inline-flex items-center gap-2 text-sm text-mist-500">
            <Spinner className="h-4 w-4" />
            Checking…
          </span>
        ) : null}
      </div>

      {error && (
        <p className="border-b border-white/5 px-4 py-3 text-sm text-rose-300">{error}</p>
      )}

          {health && health.records.length > 0 ? (
        <div className="divide-y divide-white/5">
          {health.records.map((r, i) => {
            const copyKey = `${r.name}-${r.type}-${i}`;
            const ok = r.status === "verified";
            const optional = r.optional === true;
            return (
              <div key={copyKey} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
                <span
                  title={
                    ok
                      ? `${r.record} verified`
                      : optional
                        ? `${r.record}: recommended (optional)`
                        : `${r.record}: ${r.status}`
                  }
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    ok
                      ? statusTone(r.status)
                      : optional
                        ? "bg-amber-400/15 text-amber-200"
                        : statusTone(r.status)
                  }`}
                >
                  {ok ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : optional ? (
                    <span className="text-xs font-semibold">?</span>
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
                    <span className="text-xs text-mist-500">
                      {ok ? r.status : optional ? "optional" : r.status}
                    </span>
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
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map((item) => (
            <li
              key={item.key}
              title={item.tip}
              className="flex items-start gap-4 px-4 py-3"
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  item.ok
                    ? "bg-aurora-400/15 text-aurora-300"
                    : item.optional
                      ? "bg-amber-400/15 text-amber-200"
                      : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {item.ok ? (
                  <CheckIcon className="h-4 w-4" />
                ) : item.optional ? (
                  <span className="text-xs font-semibold">?</span>
                ) : (
                  <XIcon className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-mist-100">{item.label}</span>
                <span className="block text-sm text-mist-500">{item.tip}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {health?.docsUrl ? (
        <p className="border-t border-white/5 px-4 py-3 text-xs text-mist-500">
          <a
            href={health.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-aurora-300 hover:underline"
          >
            Resend domain docs
          </a>
        </p>
      ) : null}
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

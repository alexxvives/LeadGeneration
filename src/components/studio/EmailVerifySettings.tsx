"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ZeruhUsage } from "@/lib/client-api";
import { UsageBar } from "@/components/studio/UpgradeModal";
import { Spinner } from "@/components/ui";

/**
 * Easy-path toggle: verify recipient emails via Zeruh before send.
 * Platform key (MAILEROO_VERIFY_API_KEY) — not per-user BYO.
 */
export function EmailVerifySettings({
  canVerify,
  initialEnabled,
  canEdit,
}: {
  /** Server has a Zeruh / Maileroo Verify API key. */
  canVerify: boolean;
  initialEnabled: boolean;
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [usage, setUsage] = useState<ZeruhUsage | null>(null);

  const loadUsage = useCallback(async () => {
    if (!canVerify) {
      setUsage(null);
      return;
    }
    try {
      setUsage(await api.zeruhUsage());
    } catch {
      setUsage(null);
    }
  }, [canVerify]);

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  useEffect(() => {
    if (enabled && canVerify) void loadUsage();
  }, [enabled, canVerify, loadUsage]);

  async function toggle() {
    if (!canEdit || !canVerify || busy) return;
    const next = !enabled;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailVerifyEnabled: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not save");
      }
      setEnabled(next);
      setMsg(next ? "Email verify on — checks before each send." : "Email verify off.");
      if (next) void loadUsage();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (!canVerify) {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
        <p className="text-sm font-medium text-mist-100">Verify emails before send</p>
        <p className="mt-1 text-xs leading-relaxed text-mist-500">
          Not configured on this server. Set{" "}
          <code className="text-mist-300">MAILEROO_VERIFY_API_KEY</code> (Zeruh) to enable
          list hygiene. This checks recipient addresses — not domain DNS.
        </p>
      </div>
    );
  }

  const remaining = usage?.available ? usage.remainingCredits : null;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={!canEdit || busy}
        onClick={() => void toggle()}
        className={`flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors disabled:opacity-50 ${
          enabled ? "" : ""
        }`}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium text-mist-100">
            Verify emails before send
            {busy ? <Spinner className="h-3.5 w-3.5 text-mist-500" /> : null}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-mist-500">
            Zeruh checks each recipient is deliverable (~1 credit per send). Not domain DNS.
          </span>
        </span>
        <span
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-aurora-400" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink-950 shadow transition-transform ${
              enabled ? "left-5" : "left-0.5"
            }`}
          />
        </span>
      </button>

      {enabled && remaining != null ? (
        <UsageBar label="Email verifies (Zeruh)" remaining={remaining} />
      ) : null}

      {msg ? <p className="text-xs text-mist-400">{msg}</p> : null}
    </div>
  );
}

/** Compact bar for Settings / studio when Zeruh is on. */
export function ZeruhUsageBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .zeruhUsage()
      .then((u) => {
        if (!cancelled && u.available && u.remainingCredits != null) {
          setRemaining(u.remainingCredits);
        }
      })
      .catch(() => {
        if (!cancelled) setRemaining(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (remaining == null) return null;
  return <UsageBar label="Verifies" remaining={remaining} />;
}

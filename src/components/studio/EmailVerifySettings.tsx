"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";

/**
 * Easy-path toggle: verify recipient emails before send.
 * Platform keys: MYEMAILVERIFIER_API_KEY (preferred) or MAILEROO_VERIFY_API_KEY.
 * Daily plan caps are shown on the studio / Settings usage bars.
 */
export function EmailVerifySettings({
  canVerify,
  initialEnabled,
  canEdit,
}: {
  /** Server has a verify API key. */
  canVerify: boolean;
  initialEnabled: boolean;
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

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
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (!canVerify) {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
        <p className="text-sm font-medium text-mist-100">Verify emails before sending</p>
        <p className="mt-1 text-xs leading-relaxed text-mist-500">
          Not configured on this server. Set{" "}
          <code className="text-mist-300">MYEMAILVERIFIER_API_KEY</code> (preferred) or{" "}
          <code className="text-mist-300">MAILEROO_VERIFY_API_KEY</code> to enable.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={!canEdit || busy}
        onClick={() => void toggle()}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors disabled:opacity-50"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-mist-100">
          Verify emails before sending
          {busy ? <Spinner className="h-3.5 w-3.5 text-mist-500" /> : null}
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
      {msg ? <p className="mt-2 text-xs text-mist-400">{msg}</p> : null}
    </div>
  );
}

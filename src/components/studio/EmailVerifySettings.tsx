"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

/**
 * Easy-path toggle: verify recipient emails before send (MyEmailVerifier).
 * Platform key: MYEMAILVERIFIER_API_KEY only (ADR 0024).
 * Daily plan caps are shown on the studio / Settings usage bars.
 *
 * Writes `workspaces.email_verify_enabled` via PATCH /api/workspace/settings
 * and re-reads the confirmed value from the response (not optimistic-only).
 */
export function EmailVerifySettings({
  canVerify,
  initialEnabled,
  canEdit,
}: {
  /** Server has MYEMAILVERIFIER_API_KEY. */
  canVerify: boolean;
  initialEnabled: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
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
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        emailVerifyEnabled?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not save");
      }
      // Trust the DB echo — never flip UI if the write didn't stick.
      const confirmed =
        typeof data.emailVerifyEnabled === "boolean"
          ? data.emailVerifyEnabled
          : next;
      setEnabled(confirmed);
      if (confirmed !== next) {
        setMsg("Could not update verify setting — try again.");
      }
      router.refresh();
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
          <code className="text-mist-300">MYEMAILVERIFIER_API_KEY</code> (Wrangler
          secret in production) to enable.
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
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-mist-100">
          Verify emails before sending
          {busy ? <Spinner className="h-3.5 w-3.5 text-mist-500" /> : null}
        </span>
        <span
          className={`switch-track relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-aurora-400" : ""
          }`}
          data-on={enabled ? "true" : "false"}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-transform ${
              enabled ? "left-5" : "left-0.5"
            }`}
          />
        </span>
      </button>
      {msg ? <p className="mt-2 text-xs text-rose-300">{msg}</p> : null}
    </div>
  );
}

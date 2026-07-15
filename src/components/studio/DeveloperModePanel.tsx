"use client";

import { useState } from "react";
import Link from "next/link";
import { StarIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client-api";

/**
 * TEMP developer tools — tour replay + credit reset.
 * Remove this section before GA.
 */
export function DeveloperModePanel({ metered }: { metered: boolean }) {
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const resetCredits = async () => {
    setResetting(true);
    setMsg(null);
    setErr(null);
    try {
      await api.resetUsage();
      setMsg("Credits reset to 0 used. Refresh the page to see updated bars.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="rounded-xl2 border border-dashed border-amber-400/25 bg-amber-400/[0.03] p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-200/70">
        Developer mode · temporary
      </p>
      <p className="mt-1 text-sm text-mist-500">
        Tools for testing. Will be removed before launch.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href="/app?setup=1"
          className="inline-flex items-center gap-2 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-4 py-2 text-sm font-medium text-aurora-200 transition-colors hover:bg-aurora-400/15"
        >
          <StarIcon className="h-4 w-4" />
          Replay product tour
        </Link>
        <button
          type="button"
          onClick={() => void resetCredits()}
          disabled={!metered || resetting}
          title={metered ? "Zero lead and send usage for this month" : "Only works on the live metered app"}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-mist-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {resetting ? <Spinner className="h-3.5 w-3.5" /> : null}
          Reset credits
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-aurora-300">{msg}</p>}
      {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
      {!metered && (
        <p className="mt-3 text-xs text-mist-500">
          Reset credits needs the live app (usage isn&apos;t metered in local preview).
        </p>
      )}
    </div>
  );
}

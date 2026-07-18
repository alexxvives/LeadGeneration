"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { Spinner } from "@/components/ui";

/**
 * Settings-page billing controls. "Manage billing" opens the Stripe Billing
 * Portal for paid workspaces; free/unpaid workspaces get an Upgrade link to
 * /pricing. Rendered only for metered workspaces.
 */
export function BillingActions({ paid }: { paid: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.portal();
      if (url) window.location.href = url;
      else setError("Could not open the billing portal.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-105"
      >
        {paid ? "Change plan" : "Upgrade"}
      </Link>
      {paid && (
        <button
          onClick={openPortal}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          {busy ? <Spinner className="h-4 w-4" /> : null}
          Manage billing
        </button>
      )}
      {error && <span className="text-sm text-rose-300">{error}</span>}
    </div>
  );
}

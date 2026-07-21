"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { api } from "@/lib/client-api";

/**
 * Danger zone: permanently delete the signed-in account + workspace data.
 */
export function DeleteAccountPanel({
  email,
  liveApp,
}: {
  email: string | null;
  /** False in local demo — deletion API rejects. */
  liveApp: boolean;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const expected = "DELETE";
  const canSubmit = confirm.trim().toUpperCase() === expected && !busy && liveApp;

  async function onDelete() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteAccount();
      await signOut({ callbackUrl: "/" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete account");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl2 border border-rose-400/25 bg-rose-400/[0.04] p-5">
      <p className="text-sm font-medium text-mist-100">Delete account</p>
      <p className="mt-1 text-sm text-mist-500">
        Permanently removes your workspace, leads, outreach, and login
        {email ? (
          <>
            {" "}
            for <span className="text-mist-300">{email}</span>
          </>
        ) : null}
        . This cannot be undone.
      </p>
      {!liveApp ? (
        <p className="mt-3 text-xs text-amber-200/80">
          Account deletion is only available on the live app (not local demo).
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-full border border-rose-400/40 px-4 py-2 text-sm font-medium text-rose-200 transition-colors hover:bg-rose-400/10"
        >
          Delete my account…
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-mist-500">
            Type <span className="font-mono text-mist-300">{expected}</span> to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input-ink mt-1.5 w-full max-w-xs py-2 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {err ? <p className="text-sm text-rose-300">{err}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void onDelete()}
              className="rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setErr(null);
              }}
              className="rounded-full px-4 py-2 text-sm text-mist-400 hover:text-mist-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

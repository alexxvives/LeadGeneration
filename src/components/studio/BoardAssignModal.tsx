"use client";

import { useEffect, useState } from "react";
import type { BoardSummary } from "@/lib/types";
import { api } from "@/lib/client-api";
import { Spinner } from "@/components/ui";
import { XIcon } from "@/components/icons";

export type BoardDestination = {
  boardId: string;
  newBoardName?: string;
};

/**
 * Modal to pick (or create) a destination board before search/import.
 * Default board is always available; All-filter selection falls back to Default.
 */
export function BoardAssignModal({
  open,
  title = "Which board?",
  subtitle = "New leads will be added to this board.",
  boards,
  preferredBoardId,
  confirmLabel = "Continue",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  subtitle?: string;
  boards: BoardSummary[];
  /** Preselect: preferred board, else Default. */
  preferredBoardId?: string | null;
  confirmLabel?: string;
  onConfirm: (dest: BoardDestination) => void | Promise<void>;
  onClose: () => void;
}) {
  const defaultId =
    boards.find((b) => b.isDefault)?.id ??
    boards[0]?.id ??
    null;
  const initial =
    (preferredBoardId && boards.some((b) => b.id === preferredBoardId)
      ? preferredBoardId
      : null) ?? defaultId;

  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [localBoards, setLocalBoards] = useState(boards);

  useEffect(() => {
    if (!open) return;
    setLocalBoards(boards);
    setSelectedId(initial);
    setCreating(false);
    setNewName("");
    setErr(null);
  }, [open, boards, initial]);

  if (!open) return null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setErr("Enter a board name");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { board } = await api.createBoard(name);
      const summary: BoardSummary = {
        ...board,
        leadCount: 0,
        contactedCount: 0,
        sentCount: 0,
        closedCount: 0,
      };
      setLocalBoards((prev) => [...prev, summary]);
      setSelectedId(board.id);
      setCreating(false);
      setNewName("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create board");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!selectedId) {
      setErr("Pick a board");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onConfirm({ boardId: selectedId });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-assign-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl2 border border-white/10 bg-ink-900 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="board-assign-title"
              className="font-display text-xl font-semibold text-mist-100"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-mist-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-mist-500 hover:bg-white/5 hover:text-mist-200"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-5 max-h-56 space-y-1.5 overflow-y-auto">
          {localBoards.map((b) => {
            const active = selectedId === b.id;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(b.id);
                    setCreating(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    active
                      ? "border-aurora-400/40 bg-aurora-400/10 text-aurora-300"
                      : "border-white/8 bg-ink-950/40 text-mist-200 hover:border-white/15"
                  }`}
                >
                  <span className="truncate text-sm font-medium">
                    {b.name}
                    {b.isDefault ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-mist-500">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-mist-500">
                    {b.leadCount} lead{b.leadCount === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {creating ? (
          <div className="mt-4 flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              placeholder="New board name"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-600 focus:border-aurora-400/40 focus:outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCreate()}
              className="rounded-xl bg-aurora-400 px-3 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 w-full rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-sm text-mist-400 transition-colors hover:border-aurora-400/30 hover:text-aurora-300"
          >
            + Create new board
          </button>
        )}

        {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-mist-400 hover:text-mist-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !selectedId}
            onClick={() => void handleConfirm()}
            className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
          >
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { BoardSummary } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { BoardsIcon } from "@/components/icons";
import Link from "next/link";

export function BoardsView({
  onSelectBoard,
}: {
  onSelectBoard?: (boardId: string) => void;
}) {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const refresh = useCallback(async () => {
    const { boards: list } = await api.listBoards();
    setBoards(list);
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createBoard(name);
      setNewName("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.renameBoard(id, name);
      setEditingId(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this board? Leads move to Default.")) return;
    setBusy(true);
    try {
      await api.deleteBoard(id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6 text-aurora-300" />
      </div>
    );
  }

  return (
    <div className="animate-float-up space-y-6">
      <div className="flex flex-wrap gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          placeholder="New board name"
          className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-ink-900/60 px-4 py-2.5 text-sm text-mist-100 placeholder:text-mist-600 focus:border-aurora-400/40 focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || !newName.trim()}
          onClick={() => void handleCreate()}
          className="rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 disabled:opacity-50"
        >
          Create board
        </button>
      </div>

      {err && <p className="text-sm text-rose-300">{err}</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((b) => (
          <li key={b.id} className="glass card-hover rounded-xl2 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aurora-400/10">
                <BoardsIcon className="h-5 w-5 text-aurora-300" />
              </div>
              <div className="min-w-0 flex-1">
                {editingId === b.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-950 px-2 py-1 text-sm"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="text-xs text-aurora-300"
                      onClick={() => void handleRename(b.id)}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <h3 className="truncate font-display text-lg font-semibold text-mist-100">
                    {b.name}
                    {b.isDefault ? (
                      <span className="ml-2 text-[10px] font-sans uppercase tracking-wider text-mist-500">
                        Default
                      </span>
                    ) : null}
                  </h3>
                )}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-mist-400">
                  <div>
                    <dt className="text-mist-500">Leads</dt>
                    <dd className="font-display text-lg text-mist-100">{b.leadCount}</dd>
                  </div>
                  <div>
                    <dt className="text-mist-500">Contacted</dt>
                    <dd className="font-display text-lg text-mist-100">
                      {b.contactedCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-mist-500">Sent</dt>
                    <dd className="font-display text-lg text-mist-100">{b.sentCount}</dd>
                  </div>
                  <div>
                    <dt className="text-mist-500">Closed</dt>
                    <dd className="font-display text-lg text-mist-100">{b.closedCount}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-3">
              <Link
                href={`/app?view=pipeline&board=${b.id}`}
                onClick={() => onSelectBoard?.(b.id)}
                className="rounded-full bg-aurora-400/15 px-3 py-1.5 text-xs font-medium text-aurora-300 hover:bg-aurora-400/25"
              >
                Open pipeline
              </Link>
              {!b.isDefault && (
                <>
                  <button
                    type="button"
                    className="rounded-full px-3 py-1.5 text-xs text-mist-400 hover:text-mist-100"
                    onClick={() => {
                      setEditingId(b.id);
                      setEditName(b.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-3 py-1.5 text-xs text-rose-400/80 hover:text-rose-300"
                    onClick={() => void handleDelete(b.id)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

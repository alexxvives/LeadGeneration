"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { BoardInvite, BoardSummary } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { BoardsIcon, PencilIcon, XIcon } from "@/components/icons";

export function BoardsView({
  onSelectBoard,
  createRequestId = 0,
}: {
  onSelectBoard?: (boardId: string) => void;
  /** Increment from parent to open the create-board prompt. */
  createRequestId?: number;
}) {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [invites, setInvites] = useState<BoardInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const refresh = useCallback(async () => {
    const [{ boards: list }, { invites: pending }] = await Promise.all([
      api.listBoards(),
      api.listMyInvites().catch(() => ({ invites: [] as BoardInvite[] })),
    ]);
    setBoards(list);
    setInvites(pending);
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    const name = window.prompt("Board name")?.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createBoard(name);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (createRequestId > 0) void handleCreate();
  }, [createRequestId, handleCreate]);

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

  async function handleInvite(boardId: string) {
    const email = window.prompt("Invite by email")?.trim();
    if (!email) return;
    setBusy(true);
    setErr(null);
    try {
      await api.inviteToBoard(boardId, email);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(inviteId: string) {
    setBusy(true);
    setErr(null);
    try {
      await api.acceptInvite(inviteId);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Accept failed");
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
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {busy ? (
        <p className="text-xs text-mist-500">Working…</p>
      ) : null}

      {invites.length > 0 ? (
        <section className="rounded-xl2 border border-amber-400/25 bg-amber-400/5 p-4">
          <h2 className="text-sm font-medium text-amber-200">
            Board invites
          </h2>
          <ul className="mt-3 space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-mist-200">
                  <span className="font-medium text-mist-100">{inv.boardName}</span>
                  <span className="text-mist-500"> · editor</span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleAccept(inv.id)}
                  className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-on-accent"
                >
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((b) => (
          <li key={b.id} className="group relative">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (editingId === b.id) return;
                onSelectBoard?.(b.id);
              }}
              onKeyDown={(e) => {
                if (editingId === b.id) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectBoard?.(b.id);
                }
              }}
              className="glass card-hover w-full cursor-pointer rounded-xl2 p-5 text-left outline-none focus-visible:ring-1 focus-visible:ring-aurora-400/50"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aurora-400/10">
                  <BoardsIcon className="h-5 w-5 text-aurora-300" />
                </div>
                <div className="min-w-0 flex-1">
                  {editingId === b.id ? (
                    <div
                      className="flex gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-950 px-2 py-1 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleRename(b.id);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
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
                    <h3 className="flex min-w-0 items-center gap-1.5 font-display text-lg font-semibold text-mist-100">
                      <span className="truncate">{b.name}</span>
                      {b.isDefault ? (
                        <span className="shrink-0 text-[10px] font-sans uppercase tracking-wider text-mist-500">
                          Default
                        </span>
                      ) : null}
                      {b.shared ? (
                        <span className="shrink-0 text-[10px] font-sans uppercase tracking-wider text-amber-400">
                          Shared
                        </span>
                      ) : null}
                      {!b.isDefault && !b.shared ? (
                        <button
                          type="button"
                          aria-label={`Rename ${b.name}`}
                          title="Rename"
                          className="inline-flex shrink-0 rounded-md p-1 text-mist-500 opacity-0 transition-opacity hover:bg-white/5 hover:text-mist-200 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(b.id);
                            setEditName(b.name);
                          }}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
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
                  {!b.shared ? (
                    <button
                      type="button"
                      className="mt-3 text-xs font-medium text-aurora-300 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleInvite(b.id);
                      }}
                    >
                      Invite collaborator
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {!b.isDefault && !b.shared ? (
              <button
                type="button"
                aria-label={`Delete ${b.name}`}
                title="Delete"
                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg text-mist-500 opacity-0 transition-opacity hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100"
                onClick={() => void handleDelete(b.id)}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client-api";
import type { BoardInvite, BoardMember, BoardSummary } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { PencilIcon, UsersIcon, XIcon } from "@/components/icons";

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
  const [inviteBoard, setInviteBoard] = useState<BoardSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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

  useEffect(() => {
    if (createRequestId > 0) setCreateOpen(true);
  }, [createRequestId]);

  async function handleCreate(name: string) {
    setBusy(true);
    setErr(null);
    try {
      await api.createBoard(name);
      setCreateOpen(false);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
      throw e;
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

      <ul className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        {invites.map((inv) => (
          <li key={inv.id}>
            <div className="flex h-full flex-col rounded-xl2 border-2 border-dashed border-amber-400/45 bg-amber-400/[0.06] p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-amber-300/90">
                    Invite pending
                  </p>
                  <h3 className="mt-1 truncate font-display text-lg font-semibold text-mist-100">
                    {inv.boardName}
                  </h3>
                  <p className="mt-1 text-xs text-mist-500">
                    Editor access · confirm to join this board
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-1 flex-col justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAccept(inv.id)}
                  className="w-full rounded-full bg-aurora-400 px-4 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:opacity-50"
                >
                  Accept invite
                </button>
              </div>
            </div>
          </li>
        ))}
        {boards.map((b) => (
          <li key={b.id} className="group relative">
            {!b.isDefault && !b.shared ? (
              <button
                type="button"
                aria-label={`Delete ${b.name}`}
                title="Delete"
                className="absolute -right-2 -top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink-700 bg-ink-850 text-mist-400 opacity-0 shadow-sm transition-opacity hover:border-rose-400/50 hover:bg-rose-500/15 hover:text-rose-500 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(b.id);
                }}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 pr-1">
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
                      {b.shared ? (
                        <span className="shrink-0 text-[10px] font-sans uppercase tracking-wider text-amber-400">
                          Shared
                        </span>
                      ) : null}
                      {!b.shared ? (
                        <button
                          type="button"
                          aria-label={`Rename ${b.name}`}
                          title="Rename"
                          className="inline-flex shrink-0 rounded-md p-1 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-200"
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
                </div>
                {!b.shared ? (
                  <button
                    type="button"
                    title="Invite collaborator"
                    aria-label={`Invite collaborator to ${b.name}`}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-white/10 px-2.5 text-[11px] font-medium text-aurora-300 transition-colors hover:border-aurora-400/40 hover:bg-aurora-400/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInviteBoard(b);
                    }}
                  >
                    <UsersIcon className="h-3.5 w-3.5" />
                    Invite
                  </button>
                ) : null}
              </div>

              <dl className="mt-4 space-y-3 text-xs text-mist-400">
                <div className="text-center">
                  <dt className="text-mist-500">Leads</dt>
                  <dd className="font-display text-2xl text-mist-100">
                    {b.leadCount}
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-white/8 pt-3 text-center">
                  <div>
                    <dt className="text-mist-500">Contacted</dt>
                    <dd className="font-display text-lg text-mist-100">
                      {b.contactedCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-mist-500">Sent</dt>
                    <dd className="font-display text-lg text-mist-100">
                      {b.sentCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-mist-500">Closed</dt>
                    <dd className="font-display text-lg text-mist-100">
                      {b.closedCount}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </li>
        ))}
      </ul>

      {createOpen ? (
        <CreateBoardModal
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      ) : null}

      {inviteBoard ? (
        <BoardInviteModal
          board={inviteBoard}
          onClose={() => setInviteBoard(null)}
          onInvited={() => void refresh()}
        />
      ) : null}
    </div>
  );
}

function CreateBoardModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Enter a board name");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onCreate(trimmed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-board-title"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-ink-950/80"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-xl2 border border-white/10 bg-ink-900 p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="create-board-title"
              className="font-display text-xl font-semibold text-mist-100"
            >
              New board
            </h2>
            <p className="mt-1 text-sm text-mist-500">
              A board holds a search niche, pipeline, and outreach queue.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-mist-500 hover:bg-white/5 hover:text-mist-200"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-medium text-mist-500">
            Board name
          </span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="e.g. Barcelona spas"
            className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-aurora-400/50 focus:outline-none"
          />
        </label>

        {err ? (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {err}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            {busy ? <Spinner className="h-4 w-4" /> : null}
            Create board
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BoardInviteModal({
  board,
  onClose,
  onInvited,
}: {
  board: BoardSummary;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [pending, setPending] = useState<BoardInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const loadPeople = useCallback(async () => {
    const { invites, members: m } = await api.listBoardInvites(board.id);
    setMembers(m);
    setPending(invites);
  }, [board.id]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    loadPeople()
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [loadPeople]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) {
      setErr("Enter an email address");
      return;
    }
    setBusy(true);
    setErr(null);
    setOkMsg(null);
    try {
      const { emailSent } = await api.inviteToBoard(board.id, trimmed);
      setEmail("");
      setOkMsg(
        emailSent
          ? `Invite emailed to ${trimmed}. They can also accept under Boards when signed in.`
          : `Invite saved for ${trimmed}. They’ll see it under Boards when signed in — notification email couldn’t be sent (check platform Resend/Maileroo).`,
      );
      await loadPeople();
      onInvited();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-invite-title"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-ink-950/80"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-xl2 border border-white/10 bg-ink-900 p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="board-invite-title"
              className="font-display text-xl font-semibold text-mist-100"
            >
              Collaborate
            </h2>
            <p className="mt-0.5 truncate text-sm text-mist-500">{board.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-mist-500 hover:bg-white/5 hover:text-mist-200"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-medium text-mist-500">
            Invite by email
          </span>
          <div className="flex gap-2">
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleInvite();
                }
              }}
              placeholder="colleague@company.com"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-aurora-400/50 focus:outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleInvite()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-aurora-400 px-4 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {busy ? <Spinner className="h-4 w-4" /> : <UsersIcon className="h-4 w-4" />}
              Invite
            </button>
          </div>
        </label>

        {err ? (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {err}
          </p>
        ) : null}
        {okMsg ? (
          <p className="mt-3 rounded-lg border border-aurora-400/25 bg-aurora-400/10 px-3 py-2 text-sm text-aurora-200">
            {okMsg}
          </p>
        ) : null}

        <div className="mt-5 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-mist-500">
            People on this board
          </h3>
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner className="h-5 w-5 text-aurora-300" />
            </div>
          ) : (
            <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto">
              <li className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-ink-950/60 px-3 py-2.5 text-sm">
                <span className="truncate text-mist-100">You</span>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-mist-500">
                  Owner
                </span>
              </li>
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-ink-950/60 px-3 py-2.5 text-sm"
                >
                  <span className="truncate text-mist-100">
                    {m.email ?? m.userId}
                  </span>
                  <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-mist-500">
                    {m.role}
                  </span>
                </li>
              ))}
              {pending.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm"
                >
                  <span className="truncate text-mist-100">{inv.email}</span>
                  <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
                    Pending
                  </span>
                </li>
              ))}
              {members.length === 0 && pending.length === 0 ? (
                <li className="px-1 py-2 text-xs text-mist-500">
                  No collaborators yet — invite someone by email.
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

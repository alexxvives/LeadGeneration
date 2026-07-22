"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import type { AdminUserRow, PlanId } from "@/lib/types";
import { ADMIN_PLAN_ORDER, getPlan } from "@/lib/plans";
import { Spinner } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { TrashIcon, XIcon } from "@/components/icons";
import { AdminUsersSkeleton, useDeferredLoading } from "./skeletons";

type Toast = { id: number; kind: "ok" | "err"; text: string };

export function AdminUsersView() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanId | "all">("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  function toast(kind: Toast["kind"], text: string) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .adminUsers()
      .then(({ users: list }) => {
        if (!cancelled) setUsers(list);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accountOptions = useMemo(() => {
    if (!users) return [];
    return [...users]
      .sort((a, b) =>
        (a.ownerEmail ?? a.workspaceName).localeCompare(
          b.ownerEmail ?? b.workspaceName,
        ),
      )
      .map((u) => ({
        id: u.workspaceId,
        label: u.ownerEmail ?? u.ownerName ?? u.workspaceName,
      }));
  }, [users]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (accountFilter !== "all" && u.workspaceId !== accountFilter) return false;
      if (planFilter !== "all" && u.planId !== planFilter) return false;
      if (!needle) return true;
      const hay = [
        u.ownerEmail,
        u.ownerName,
        u.workspaceName,
        u.workspaceId,
        u.stripeCustomerId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [users, q, planFilter, accountFilter]);

  const showUsersSkeleton = useDeferredLoading(!users && !err);
  if (err && !users) {
    return (
      <div className="rounded-xl2 border border-rose-400/20 bg-rose-400/5 px-5 py-4 text-sm text-rose-200">
        {err}
      </div>
    );
  }

  if (!users) {
    return showUsersSkeleton ? (
      <div role="status" aria-busy="true" aria-label="Loading users">
        <AdminUsersSkeleton />
      </div>
    ) : (
      <div className="min-h-[40vh]" aria-hidden />
    );
  }

  async function generateInsiderLink() {
    setInviteBusy(true);
    setErr(null);
    try {
      const { url } = await api.createInsiderInvite();
      setInviteUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* user can copy manually */
      }
      toast("ok", "Insider signup link ready");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create invite");
    } finally {
      setInviteBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const expected = "DELETE";
    if (deleteConfirm.trim().toUpperCase() !== expected) return;
    const u = deleteTarget;
    setDeletingId(u.workspaceId);
    setErr(null);
    try {
      await api.adminDeleteUser(u.workspaceId);
      setUsers((prev) =>
        prev ? prev.filter((row) => row.workspaceId !== u.workspaceId) : prev,
      );
      setDeleteTarget(null);
      setDeleteConfirm("");
      toast("ok", "Account deleted");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleFindLeads(u: AdminUserRow) {
    if (togglingId) return;
    const next = !u.findLeadsEnabled;
    setTogglingId(u.workspaceId);
    setErr(null);
    try {
      await api.adminSetFindLeads(u.workspaceId, next);
      setUsers((prev) =>
        prev
          ? prev.map((row) =>
              row.workspaceId === u.workspaceId
                ? { ...row, findLeadsEnabled: next }
                : row,
            )
          : prev,
      );
      toast("ok", next ? "Find leads enabled" : "Find leads paused");
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Failed to update Find leads",
      );
    } finally {
      setTogglingId(null);
    }
  }

  const canConfirmDelete =
    deleteConfirm.trim().toUpperCase() === "DELETE" && !deletingId;

  return (
    <div className="relative space-y-6">
      {err ? (
        <div className="rounded-xl2 border border-rose-400/20 bg-rose-400/5 px-5 py-3 text-sm text-rose-200">
          {err}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl2 border border-white/10 bg-ink-900/40 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-mist-100">Insider access</p>
          <p className="mt-0.5 text-xs text-mist-500">
            Assign Insider on a row below, or generate a signup link (30 days).
            New accounts via the link get Insider automatically. Use Find leads
            to pause Search without changing plan — Import still works.
          </p>
          {inviteUrl ? (
            <p className="mt-2 break-all font-mono text-[11px] text-aurora-300">
              {inviteUrl}
              <span className="ml-2 text-mist-500">(copied if clipboard allowed)</span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={inviteBusy}
          onClick={() => void generateInsiderLink()}
          className="shrink-0 rounded-full bg-aurora-400 px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          {inviteBusy ? "Generating…" : "Generate Insider signup link"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="w-full min-w-[14rem] flex-1 py-2 text-sm sm:max-w-xs"
          aria-label="Filter by account"
        >
          <option value="all">All accounts</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email, workspace, Stripe…"
          className="input-ink min-w-[14rem] flex-1 py-2 text-sm"
        />
        <Select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanId | "all")}
          className="w-full py-2 text-sm sm:w-auto"
          aria-label="Filter by plan"
        >
          <option value="all">All plans</option>
          {ADMIN_PLAN_ORDER.map((id) => (
            <option key={id} value={id}>
              {getPlan(id).name}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl2 border border-white/8">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="bg-ink-900/80 text-[11px] uppercase tracking-wider text-mist-500">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Find leads</th>
              <th className="px-4 py-3 font-medium">Usage (mo)</th>
              <th className="px-4 py-3 font-medium">Verify today</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Send</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="w-12 px-2 py-3 font-medium">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-mist-500">
                  No matching users.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.workspaceId} className="group hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-mist-100">
                      {u.ownerEmail ?? u.ownerName ?? "—"}
                    </p>
                    <p className="text-xs text-mist-500">{u.workspaceName}</p>
                    {u.stripeCustomerId ? (
                      <p className="mt-0.5 font-mono text-[10px] text-mist-500">
                        {u.stripeCustomerId}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={u.planId}
                      className="min-w-[7.5rem] py-1.5 text-xs"
                      aria-label={`Plan for ${u.ownerEmail ?? u.workspaceName}`}
                      onChange={(e) => {
                        const next = e.target.value as PlanId;
                        void api
                          .setPlanDev(next, u.workspaceId)
                          .then(() => {
                            setUsers((prev) =>
                              prev
                                ? prev.map((row) =>
                                    row.workspaceId === u.workspaceId
                                      ? { ...row, planId: next }
                                      : row,
                                  )
                                : prev,
                            );
                            toast("ok", `Plan set to ${getPlan(next).name}`);
                          })
                          .catch((err) => {
                            setErr(
                              err instanceof Error
                                ? err.message
                                : "Failed to set plan",
                            );
                          });
                      }}
                    >
                      {ADMIN_PLAN_ORDER.map((id) => (
                        <option key={id} value={id}>
                          {getPlan(id).name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={u.findLeadsEnabled}
                      aria-busy={togglingId === u.workspaceId}
                      disabled={togglingId === u.workspaceId}
                      aria-label={`Find leads for ${u.ownerEmail ?? u.workspaceName}`}
                      title={
                        u.planId === "insider"
                          ? "Toggle Search for this Insider"
                          : "Toggle Search for this account"
                      }
                      onClick={() => void toggleFindLeads(u)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                        u.findLeadsEnabled
                          ? "bg-aurora-400/80"
                          : "bg-white/10"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          u.findLeadsEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <p className="mt-1 text-[10px] text-mist-500">
                      {togglingId === u.workspaceId
                        ? "…"
                        : u.findLeadsEnabled
                          ? "On"
                          : "Off"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-mist-300">
                    {u.planId === "insider" ? (
                      <>
                        <p title="Shared Firecrawl credits">
                          {u.firecrawlCreditsRemaining == null
                            ? "Credits unavailable"
                            : `${u.firecrawlCreditsRemaining.toLocaleString()} available`}
                        </p>
                        <p className="text-xs text-mist-500">
                          Shared pool · sends unlimited
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          {u.leadsUsedThisMonth}/{u.leadsLimit} leads
                        </p>
                        <p className="text-xs text-mist-500">
                          {u.sendsUsedThisMonth}/{u.sendsLimit} sends
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-mist-300">
                    {u.verifiesUsedToday}/{u.verifiesLimit}
                  </td>
                  <td className="px-4 py-3 text-mist-300">
                    <p>{u.leadCount} leads</p>
                    <p className="text-xs text-mist-500">
                      {u.sentCount} sent · {u.runCount} runs
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-mist-400">
                    {[
                      u.hasEasySendKey ? "Easy" : null,
                      u.hasMailbox ? "Mailbox" : null,
                      u.emailVerifyEnabled ? "Verify on" : "Verify off",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-mist-500 whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      aria-label={`Delete ${u.ownerEmail ?? u.workspaceName}`}
                      title={`Delete ${u.ownerEmail ?? u.workspaceName}`}
                      disabled={deletingId === u.workspaceId}
                      onClick={() => {
                        setDeleteTarget(u);
                        setDeleteConfirm("");
                      }}
                      className="rounded-lg p-2 text-mist-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400/50 disabled:opacity-40"
                    >
                      {deletingId === u.workspaceId ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <TrashIcon className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[70] grid place-items-center p-6">
          <div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={() => {
              if (!deletingId) {
                setDeleteTarget(null);
                setDeleteConfirm("");
              }
            }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-title"
            className="glass animate-float-up relative w-full max-w-md rounded-xl2 p-6"
          >
            <button
              type="button"
              disabled={Boolean(deletingId)}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirm("");
              }}
              className="absolute right-3 top-3 rounded-lg p-2 text-mist-500 hover:bg-white/5 hover:text-mist-100"
              aria-label="Close"
            >
              <XIcon className="h-5 w-5" />
            </button>
            <h2
              id="admin-delete-title"
              className="font-display text-xl font-semibold text-mist-100"
            >
              Delete account
            </h2>
            <p className="mt-2 text-sm text-mist-400">
              Permanently removes the workspace, leads, outreach, login
              {deleteTarget.ownerEmail ? (
                <>
                  {" "}
                  for{" "}
                  <span className="text-mist-200">{deleteTarget.ownerEmail}</span>
                </>
              ) : null}
              , and cancels any Stripe subscription. This cannot be undone.
            </p>
            <label className="mt-4 block text-xs text-mist-500">
              Type <span className="font-mono text-mist-300">DELETE</span> to confirm
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="input-ink mt-1.5 w-full py-2 text-sm"
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canConfirmDelete}
                onClick={() => void confirmDelete()}
                className="rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {deletingId ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }}
                className="rounded-full px-4 py-2 text-sm text-mist-400 hover:text-mist-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed bottom-6 right-6 z-[80] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-2 text-sm shadow-lg ${
              t.kind === "ok"
                ? "border-aurora-400/30 bg-ink-900 text-mist-100"
                : "border-rose-400/30 bg-ink-900 text-rose-200"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

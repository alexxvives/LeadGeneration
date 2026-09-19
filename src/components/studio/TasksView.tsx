"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BoardMember,
  BoardSummary,
  LeadWithOutreach,
  Task,
  TaskStatus,
} from "@/lib/types";
import {
  TASK_STATUSES,
  formatTaskDeadline,
  taskMatchesFilter,
  taskMatchesSearch,
  taskStatusLabel,
} from "@/lib/tasks";
import { AuthorAvatar } from "@/components/studio/JournalEntries";
import { DatePicker } from "@/components/ui/DatePicker";
import { Lockable, useBoardLockUi } from "@/components/studio/board-lock";
import { TrashIcon } from "@/components/icons";

type TaskFilter = "all" | "mine" | "open" | "overdue";

const STATUS_CHIP: Record<TaskStatus, string> = {
  todo: "bg-mist-500/15 text-mist-200",
  in_progress: "bg-aurora-400/15 text-aurora-200",
  ongoing: "bg-amber-400/15 text-amber-200",
  completed: "bg-mist-600/20 text-mist-500",
};

function StatusTabs({
  value,
  onChange,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-nowrap overflow-x-auto rounded-full border border-white/10 bg-ink-900/60 p-1">
      {TASK_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            value === s
              ? "bg-aurora-400 text-on-accent"
              : "text-mist-300 hover:text-mist-100"
          }`}
        >
          {taskStatusLabel(s)}
        </button>
      ))}
    </div>
  );
}

function TaskCard({
  task,
  leadLabel,
  onOpen,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  leadLabel?: string | null;
  onOpen: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const deadline = formatTaskDeadline(task.deadline);
  const completed = task.status === "completed";
  const softOverdue =
    deadline.overdue &&
    task.status !== "ongoing" &&
    task.status !== "completed";

  return (
    <article
      className={`glass card-hover group relative flex flex-col rounded-xl2 p-4 ${
        completed ? "opacity-80" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-stretch text-left"
      >
        <div className="flex items-start gap-2">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CHIP[task.status]}`}
          >
            {taskStatusLabel(task.status)}
          </span>
          {deadline.label ? (
            <span
              className={`ml-auto text-[11px] font-medium ${
                softOverdue ? "text-rose-300" : "text-mist-500"
              }`}
            >
              {deadline.label}
            </span>
          ) : null}
        </div>
        <h3
          className={`mt-2 font-display text-base font-semibold leading-snug ${
            completed ? "text-mist-500 line-through" : "text-mist-100"
          }`}
        >
          {task.title}
        </h3>
        <div className="mt-3 flex items-center gap-2">
          {task.ownerName ? (
            <AuthorAvatar name={task.ownerName} size="sm" />
          ) : (
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-[10px] text-mist-500"
              aria-hidden
            >
              —
            </span>
          )}
          <span className="truncate text-xs text-mist-500">
            {task.ownerName || "Unassigned"}
          </span>
        </div>
        {leadLabel ? (
          <span className="mt-2 inline-flex max-w-full truncate rounded-full border border-white/10 bg-ink-950/40 px-2 py-0.5 text-[11px] text-mist-400">
            {leadLabel}
          </span>
        ) : null}
      </button>
      <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
        <label className="sr-only" htmlFor={`task-status-${task.id}`}>
          Status
        </label>
        <Lockable>
          <select
            id={`task-status-${task.id}`}
            value={task.status}
            disabled={editLocked}
            title={editLocked ? lockHint : undefined}
            onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
            className="select-glass min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-900/60 px-2 py-1.5 text-xs text-mist-100 disabled:opacity-50"
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{taskStatusLabel(s)}</option>
            ))}
          </select>
        </Lockable>
        <Lockable>
          <button
            type="button"
            disabled={editLocked}
            title={editLocked ? lockHint : "Delete task"}
            onClick={onDelete}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-mist-500 opacity-0 transition-opacity hover:bg-white/5 hover:text-rose-300 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-50"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </Lockable>
      </div>
    </article>
  );
}

function TaskEditSheet({
  open,
  task,
  owners,
  leads,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  task: Partial<Task> | null;
  owners: { userId: string | null; name: string }[];
  leads: LeadWithOutreach[];
  onClose: () => void;
  onSave: (input: {
    title: string;
    ownerUserId: string | null;
    ownerName: string | null;
    deadline: string | null;
    status: TaskStatus;
    leadId: string | null;
  }) => Promise<void>;
  onDelete?: () => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const [title, setTitle] = useState("");
  const [ownerKey, setOwnerKey] = useState("");
  const [deadline, setDeadline] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    const oid = task?.ownerUserId ?? "";
    const oname = task?.ownerName ?? "";
    setOwnerKey(oid ? `id:${oid}` : oname ? `name:${oname}` : "");
    setDeadline(task?.deadline ?? null);
    setStatus(task?.status ?? "todo");
    setLeadId(task?.leadId ?? null);
    setLeadQuery("");
  }, [open, task]);

  const leadOptions = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    return leads
      .filter((l) => {
        if (!q) return true;
        const blob = [l.company, l.contactName].filter(Boolean).join(" ").toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 8);
  }, [leads, leadQuery]);

  if (!open) return null;

  const ownerFromKey = () => {
    if (!ownerKey) return { ownerUserId: null, ownerName: null };
    if (ownerKey.startsWith("id:")) {
      const id = ownerKey.slice(3);
      const m = owners.find((o) => o.userId === id);
      return { ownerUserId: id, ownerName: m?.name ?? null };
    }
    if (ownerKey.startsWith("name:")) {
      return { ownerUserId: null, ownerName: ownerKey.slice(5) };
    }
    return { ownerUserId: null, ownerName: null };
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-stretch justify-end bg-ink-950/70 backdrop-blur-sm md:items-center md:justify-center md:p-6">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-edit-title"
        className="relative flex h-dvh w-full max-w-lg flex-col border-white/10 bg-ink-950 shadow-2xl md:h-auto md:max-h-[90dvh] md:rounded-xl2 md:border"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="task-edit-title" className="font-display text-lg font-semibold">
            {task?.id ? "Edit task" : "Add task"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-mist-400 hover:text-mist-100"
          >
            Cancel
          </button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (editLocked || !title.trim()) return;
            setBusy(true);
            const owner = ownerFromKey();
            void onSave({
              title: title.trim(),
              ...owner,
              deadline,
              status,
              leadId,
            }).finally(() => setBusy(false));
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-mist-400">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={300}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2.5 text-sm text-mist-100 outline-none focus:border-aurora-400/60"
              placeholder="What needs doing?"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-mist-400">Owner</span>
            <select
              value={ownerKey}
              onChange={(e) => setOwnerKey(e.target.value)}
              className="select-glass mt-1 w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2.5 text-sm text-mist-100"
            >
              <option value="">Unassigned</option>
              {owners.map((o) => (
                <option
                  key={o.userId ?? o.name}
                  value={o.userId ? `id:${o.userId}` : `name:${o.name}`}
                >
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="text-xs font-medium text-mist-400">Deadline</span>
            <div className="mt-1">
              <DatePicker
                value={deadline ?? ""}
                onChange={(v) => setDeadline(v || null)}
              />
            </div>
          </div>
          <div>
            <span className="mb-2 block text-xs font-medium text-mist-400">Status</span>
            <StatusTabs value={status} onChange={setStatus} />
          </div>
          <div>
            <span className="text-xs font-medium text-mist-400">Linked lead</span>
            <input
              type="search"
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              placeholder="Search company…"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-mist-100 outline-none focus:border-aurora-400/60"
            />
            {leadId ? (
              <p className="mt-2 text-xs text-mist-400">
                Linked:{" "}
                {leads.find((l) => l.id === leadId)?.company ?? leadId}
                <button
                  type="button"
                  className="ml-2 text-aurora-300 hover:underline"
                  onClick={() => setLeadId(null)}
                >
                  Clear
                </button>
              </p>
            ) : (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {leadOptions.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-mist-200 hover:bg-white/5"
                      onClick={() => {
                        setLeadId(l.id);
                        setLeadQuery("");
                      }}
                    >
                      {l.company}
                      {l.contactName ? (
                        <span className="text-mist-500"> · {l.contactName}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {task?.id && onDelete ? (
              <Lockable>
                <button
                  type="button"
                  disabled={editLocked || busy}
                  title={editLocked ? lockHint : "Delete task"}
                  onClick={onDelete}
                  className="rounded-full border border-rose-400/30 px-4 py-2 text-sm text-rose-300 hover:bg-rose-400/10 disabled:opacity-50"
                >
                  Delete
                </button>
              </Lockable>
            ) : null}
            <button
              type="submit"
              disabled={editLocked || busy || !title.trim()}
              title={editLocked ? lockHint : undefined}
              className="ml-auto rounded-full bg-aurora-400 px-6 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TasksView({
  tasks,
  leads,
  boards,
  filterBoardId,
  currentUserId,
  members,
  searchQuery,
  onRefresh,
  onOpenLead,
  onToast,
  addOpenSignal,
  onAddOpenConsumed,
}: {
  tasks: Task[];
  leads: LeadWithOutreach[];
  boards: BoardSummary[];
  filterBoardId: string | null;
  currentUserId: string | null;
  members: BoardMember[];
  searchQuery: string;
  onRefresh: () => void;
  onOpenLead: (leadId: string) => void;
  onToast: (
    kind: "ok" | "err",
    text: string,
    duration?: number,
    key?: string,
    action?: { label: string; onClick: () => void },
  ) => void;
  addOpenSignal?: boolean;
  onAddOpenConsumed?: () => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>("todo");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const leadLabel = (leadId: string | null) => {
    if (!leadId) return null;
    const l = leads.find((x) => x.id === leadId);
    if (!l) return "Lead";
    return l.contactName?.trim()
      ? `${l.company} · ${l.contactName}`
      : l.company;
  };

  const owners = useMemo(() => {
    const seen = new Set<string>();
    const out: { userId: string | null; name: string }[] = [];
    for (const m of members) {
      const key = m.userId ?? m.email ?? "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        userId: m.userId,
        name: m.email?.split("@")[0] ?? "Member",
      });
    }
    return out;
  }, [members]);

  const filtered = useMemo(() => {
    const labelFor = (leadId: string | null) => {
      if (!leadId) return null;
      const l = leads.find((x) => x.id === leadId);
      if (!l) return "Lead";
      return l.contactName?.trim()
        ? `${l.company} · ${l.contactName}`
        : l.company;
    };
    return tasks.filter((t) => {
      if (!taskMatchesFilter(t, filter, currentUserId)) return false;
      return taskMatchesSearch(t, searchQuery, labelFor(t.leadId));
    });
  }, [tasks, filter, currentUserId, searchQuery, leads]);

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      ongoing: [],
      completed: [],
    };
    for (const t of filtered) map[t.status].push(t);
    return map;
  }, [filtered]);

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  useEffect(() => {
    if (!addOpenSignal) return;
    openCreate();
    onAddOpenConsumed?.();
  }, [addOpenSignal, onAddOpenConsumed]);

  const openEdit = (task: Task) => {
    setEditing(task);
    setSheetOpen(true);
  };

  const defaultBoardId =
    filterBoardId ?? boards[0]?.id ?? null;

  const handleSave = async (input: {
    title: string;
    ownerUserId: string | null;
    ownerName: string | null;
    deadline: string | null;
    status: TaskStatus;
    leadId: string | null;
  }) => {
    const { api } = await import("@/lib/client-api");
    try {
      if (editing?.id) {
        await api.updateTask(editing.id, input);
        onToast("ok", "Task saved.");
      } else {
        await api.createTask({
          boardId: defaultBoardId,
          ...input,
        });
        onToast("ok", "Task created.");
      }
      setSheetOpen(false);
      onRefresh();
    } catch (e) {
      onToast("err", (e as Error).message);
    }
  };

  const handleDelete = async (task: Task) => {
    const { api } = await import("@/lib/client-api");
    const snapshot = task;
    try {
      await api.deleteTask(task.id);
      onRefresh();
      onToast("ok", "Task deleted.", 8000, `undo-task-${task.id}`, {
        label: "Undo",
        onClick: () => {
          void api
            .createTask({
              boardId: snapshot.boardId,
              title: snapshot.title,
              ownerUserId: snapshot.ownerUserId,
              ownerName: snapshot.ownerName,
              deadline: snapshot.deadline,
              status: snapshot.status,
              leadId: snapshot.leadId,
              contactId: snapshot.contactId,
            })
            .then(() => onRefresh())
            .catch((e) => onToast("err", (e as Error).message));
        },
      });
      setSheetOpen(false);
    } catch (e) {
      onToast("err", (e as Error).message);
    }
  };

  const patchStatus = async (task: Task, status: TaskStatus) => {
    const { api } = await import("@/lib/client-api");
    try {
      await api.updateTask(task.id, { status });
      onRefresh();
    } catch (e) {
      onToast("err", (e as Error).message);
    }
  };

  const filterTabs: { id: TaskFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "mine", label: "Mine" },
    { id: "open", label: "Open" },
    { id: "overdue", label: "Overdue" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <p className="text-sm text-mist-400">
          {filtered.length === 0
            ? "No tasks"
            : `${filtered.length} task${filtered.length === 1 ? "" : "s"}`}
        </p>
        <div className="ml-auto flex flex-nowrap gap-1 overflow-x-auto rounded-full border border-white/10 bg-ink-900/40 p-1">
          {filterTabs.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                filter === f.id
                  ? "bg-aurora-400/20 text-aurora-200"
                  : "text-mist-400 hover:text-mist-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Lockable className="hidden lg:block">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-aurora-400 px-4 py-1.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            Add task
          </button>
        </Lockable>
      </div>

      {tasks.length === 0 ? (
        <div className="glass rounded-xl2 px-6 py-16 text-center">
          <p className="font-display text-xl font-semibold">No tasks yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-mist-400">
            Track work across the workspace — standalone or linked to a lead.
          </p>
          <Lockable className="mt-6 inline-block">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-full bg-aurora-400 px-6 py-2.5 text-sm font-medium text-on-accent disabled:opacity-50"
            >
              Add task
            </button>
          </Lockable>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-xl2 px-6 py-12 text-center">
          <p className="text-sm text-mist-400">No tasks match this filter.</p>
        </div>
      ) : (
        <>
          <div className="hidden min-h-0 flex-1 gap-3 lg:grid lg:grid-cols-4 lg:overflow-hidden">
            {TASK_STATUSES.map((status) => (
              <section
                key={status}
                className="flex min-h-0 flex-col rounded-xl2 border border-white/5 bg-ink-950/30"
              >
                <h3 className="shrink-0 border-b border-white/5 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-mist-500">
                  {taskStatusLabel(status)}
                  <span className="ml-1 tabular-nums text-mist-400">
                    {byStatus[status].length}
                  </span>
                </h3>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {byStatus[status].map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      leadLabel={leadLabel(task.leadId)}
                      onOpen={() => {
                        if (task.leadId) onOpenLead(task.leadId);
                        else openEdit(task);
                      }}
                      onStatusChange={(s) => void patchStatus(task, s)}
                      onDelete={() => void handleDelete(task)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:hidden">
            <div className="flex flex-nowrap gap-1 overflow-x-auto pb-1">
              {TASK_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMobileStatus(s)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                    mobileStatus === s
                      ? "bg-aurora-400 text-on-accent"
                      : "border border-white/10 text-mist-300"
                  }`}
                >
                  {taskStatusLabel(s)}
                  <span className="ml-1 tabular-nums opacity-80">
                    {byStatus[s].length}
                  </span>
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
              {byStatus[mobileStatus].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  leadLabel={leadLabel(task.leadId)}
                  onOpen={() => {
                    if (task.leadId) onOpenLead(task.leadId);
                    else openEdit(task);
                  }}
                  onStatusChange={(s) => void patchStatus(task, s)}
                  onDelete={() => void handleDelete(task)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <TaskEditSheet
        open={sheetOpen}
        task={editing}
        owners={owners}
        leads={leads}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        onDelete={
          editing?.id
            ? () => void handleDelete(editing)
            : undefined
        }
      />
    </div>
  );
}

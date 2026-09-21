"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type {
  BoardPerson,
  BoardSummary,
  LeadWithOutreach,
  Task,
  TaskAssignee,
  TaskStatus,
} from "@/lib/types";
import {
  TASK_STATUSES,
  assigneeKey,
  formatTaskDeadline,
  taskAssigneeSummary,
  taskAssignees,
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

function AssigneeRow({ task }: { task: Task }) {
  const list = taskAssignees(task);
  if (!list.length) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-[10px] text-mist-500"
          aria-hidden
        >
          —
        </span>
        <span className="truncate text-xs text-mist-500">Unassigned</span>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="flex shrink-0 -space-x-1.5">
        {list.slice(0, 3).map((a) => (
          <AuthorAvatar key={assigneeKey(a)} name={a.name} size="sm" />
        ))}
      </div>
      <span className="truncate text-xs text-mist-500">
        {taskAssigneeSummary(task)}
      </span>
    </div>
  );
}

function TaskCardFace({
  task,
  onOpen,
  onStatusChange,
  onDelete,
}: {
  task: Task;
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
        <AssigneeRow task={task} />
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
              <option key={s} value={s}>
                {taskStatusLabel(s)}
              </option>
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

function DraggableTaskCard({
  task,
  onOpen,
  onStatusChange,
  onDelete,
  isDragging,
}: {
  task: Task;
  onOpen: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
  isDragging: boolean;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    disabled: editLocked,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(editLocked ? {} : listeners)}
      title={editLocked ? lockHint : undefined}
      className={`${
        editLocked
          ? "cursor-not-allowed"
          : "cursor-grab touch-pan-y active:cursor-grabbing"
      } ${isDragging ? "opacity-30" : ""}`}
    >
      <TaskCardFace
        task={task}
        onOpen={onOpen}
        onStatusChange={onStatusChange}
        onDelete={onDelete}
      />
    </div>
  );
}

function TaskStatusColumn({
  status,
  tasks,
  activeId,
  onOpen,
  onStatusChange,
  onDelete,
}: {
  status: TaskStatus;
  tasks: Task[];
  activeId: string | null;
  onOpen: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onDelete: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-0 flex-col rounded-xl2 border transition-colors ${
        isOver
          ? "border-aurora-400/40 bg-aurora-400/5"
          : "border-white/5 bg-ink-950/30"
      }`}
    >
      <h3 className="shrink-0 border-b border-white/5 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-mist-500">
        {taskStatusLabel(status)}
        <span className="ml-1 tabular-nums text-mist-400">{tasks.length}</span>
      </h3>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            isDragging={activeId === task.id}
            onOpen={() => onOpen(task)}
            onStatusChange={(s) => onStatusChange(task, s)}
            onDelete={() => onDelete(task)}
          />
        ))}
      </div>
    </section>
  );
}

function TaskEditSheet({
  open,
  task,
  owners,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  task: Partial<Task> | null;
  owners: { userId: string | null; name: string }[];
  onClose: () => void;
  onSave: (input: {
    title: string;
    assignees: TaskAssignee[];
    deadline: string | null;
    status: TaskStatus;
  }) => Promise<void>;
  onDelete?: () => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  const [title, setTitle] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    if (task?.id) {
      setSelectedKeys(
        new Set(taskAssignees(task as Task).map((a) => assigneeKey(a))),
      );
    } else {
      setSelectedKeys(new Set());
    }
    setDeadline(task?.deadline ?? null);
    setStatus(task?.status ?? "todo");
  }, [open, task]);

  if (!open) return null;

  const toggleAssignee = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const assigneesFromSelection = (): TaskAssignee[] =>
    owners
      .filter((o) => selectedKeys.has(assigneeKey(o)))
      .map((o) => ({ userId: o.userId, name: o.name }));

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
            void onSave({
              title: title.trim(),
              assignees: assigneesFromSelection(),
              deadline,
              status,
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
          <fieldset>
            <legend className="text-xs font-medium text-mist-400">
              Assignees
            </legend>
            <p className="mt-0.5 text-[11px] text-mist-500">
              {selectedKeys.size === 0
                ? "Unassigned — pick one or more people."
                : `${selectedKeys.size} selected`}
            </p>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-ink-900/60 p-2">
              {owners.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-mist-500">
                  No people on this board yet — invite collaborators from Boards.
                </p>
              ) : (
                owners.map((o) => {
                const key = assigneeKey(o);
                const checked = selectedKeys.has(key);
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAssignee(key)}
                      className="rounded border-white/20 bg-ink-950 text-aurora-400"
                    />
                    <AuthorAvatar name={o.name} size="sm" />
                    <span className="text-sm text-mist-200">{o.name}</span>
                  </label>
                );
              })
              )}
            </div>
          </fieldset>
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
  people,
  searchQuery,
  onRefresh,
  onToast,
  addOpenSignal,
  onAddOpenConsumed,
}: {
  tasks: Task[];
  leads: LeadWithOutreach[];
  boards: BoardSummary[];
  filterBoardId: string | null;
  currentUserId: string | null;
  people: BoardPerson[];
  searchQuery: string;
  onRefresh: () => void;
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
  const { locked: editLocked } = useBoardLockUi();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>("todo");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragStartedRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const owners = useMemo(() => {
    const seen = new Set<string>();
    const out: { userId: string | null; name: string }[] = [];
    const push = (userId: string | null, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const idKey = userId ? `id:${userId}` : "";
      const nameKey = `name:${trimmed.toLowerCase()}`;
      if (userId && seen.has(userId)) return;
      if (seen.has(nameKey)) return;
      if (userId) seen.add(userId);
      seen.add(nameKey);
      out.push({ userId, name: trimmed });
    };
    for (const p of people) {
      push(p.userId, p.name);
    }
    for (const t of tasks) {
      for (const a of taskAssignees(t)) {
        push(a.userId, a.name);
      }
    }
    return out;
  }, [people, tasks]);

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

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

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
    if (dragStartedRef.current) return;
    setEditing(task);
    setSheetOpen(true);
  };

  const defaultBoardId = filterBoardId ?? boards[0]?.id ?? null;

  const handleSave = async (input: {
    title: string;
    assignees: TaskAssignee[];
    deadline: string | null;
    status: TaskStatus;
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
              assignees: taskAssignees(snapshot),
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
    if (task.status === status) return;
    const { api } = await import("@/lib/client-api");
    try {
      await api.updateTask(task.id, { status });
      onRefresh();
    } catch (e) {
      onToast("err", (e as Error).message);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (editLocked) return;
    dragStartedRef.current = true;
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    window.setTimeout(() => {
      dragStartedRef.current = false;
    }, 0);
    if (editLocked) return;
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    const newStatus = String(over.id) as TaskStatus;
    if (!task || !TASK_STATUSES.includes(newStatus) || task.status === newStatus) {
      return;
    }
    void patchStatus(task, newStatus);
  };

  const filterTabs: { id: TaskFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "mine", label: "Mine" },
    { id: "open", label: "Open" },
    { id: "overdue", label: "Overdue" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {tasks.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div
            className="flex flex-nowrap gap-1 overflow-x-auto rounded-full border border-white/10 bg-ink-900/40 p-1"
            role="group"
            aria-label="Task filters"
          >
            {filterTabs.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  filter === f.id
                    ? "bg-aurora-400/20 text-aurora-200"
                    : "text-mist-400 hover:text-mist-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-mist-400">
            {filtered.length === 0
              ? "No matches"
              : `${filtered.length} task${filtered.length === 1 ? "" : "s"}`}
            {editLocked ? null : (
              <span className="hidden lg:inline text-mist-500">
                {" "}
                · drag to change status
              </span>
            )}
          </p>
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <div className="glass rounded-xl2 px-6 py-16 text-center">
          <p className="font-display text-xl font-semibold">No tasks yet</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-xl2 px-6 py-12 text-center">
          <p className="text-sm text-mist-400">No tasks match this filter.</p>
        </div>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="hidden min-h-0 flex-1 gap-3 lg:grid lg:grid-cols-4 lg:overflow-hidden">
              {TASK_STATUSES.map((status) => (
                <TaskStatusColumn
                  key={status}
                  status={status}
                  tasks={byStatus[status]}
                  activeId={activeId}
                  onOpen={openEdit}
                  onStatusChange={(task, s) => void patchStatus(task, s)}
                  onDelete={(task) => void handleDelete(task)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="w-64 rotate-2 cursor-grabbing opacity-95">
                  <TaskCardFace
                    task={activeTask}
                    onOpen={() => undefined}
                    onStatusChange={() => undefined}
                    onDelete={() => undefined}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

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
                <TaskCardFace
                  key={task.id}
                  task={task}
                  onOpen={() => openEdit(task)}
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
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        onDelete={
          editing?.id ? () => void handleDelete(editing) : undefined
        }
      />
    </div>
  );
}

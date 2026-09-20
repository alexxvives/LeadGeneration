import type { FollowUp, Task, TaskAssignee, TaskStatus } from "@/lib/types";
import {
  followUpIsDone,
  isUserTask,
  resolveFollowUpKind,
  todayIsoDate,
} from "@/lib/follow-ups";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "ongoing",
  "completed",
] as const;

export function taskStatusLabel(status: TaskStatus): string {
  if (status === "todo") return "TO DO";
  if (status === "in_progress") return "IN PROGRESS";
  if (status === "ongoing") return "ONGOING";
  return "COMPLETED";
}

export function assigneeKey(a: Pick<TaskAssignee, "userId" | "name">): string {
  return a.userId ? `id:${a.userId}` : `name:${a.name}`;
}

export function sanitizeAssignees(raw: TaskAssignee[] | undefined): TaskAssignee[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: TaskAssignee[] = [];
  for (const a of raw) {
    const name = a.name?.trim();
    if (!name) continue;
    const key = assigneeKey({ userId: a.userId ?? null, name });
    const nameKey = `name:${name.toLowerCase()}`;
    if (seen.has(key) || seen.has(nameKey)) continue;
    seen.add(key);
    seen.add(nameKey);
    out.push({ userId: a.userId ?? null, name });
  }
  return out;
}

/** Resolve assignees from row fields (legacy single owner → one-item array). */
export function taskAssignees(
  task: Pick<Task, "assignees" | "ownerUserId" | "ownerName">,
): TaskAssignee[] {
  const fromArray = sanitizeAssignees(task.assignees);
  if (fromArray.length) return fromArray;
  const name = task.ownerName?.trim();
  if (!name) return [];
  return [{ userId: task.ownerUserId ?? null, name }];
}

export function syncOwnerFromAssignees(
  assignees: TaskAssignee[],
): { ownerUserId: string | null; ownerName: string | null } {
  const first = assignees[0];
  if (!first) return { ownerUserId: null, ownerName: null };
  return { ownerUserId: first.userId, ownerName: first.name };
}

export function taskAssigneeSummary(
  task: Pick<Task, "assignees" | "ownerUserId" | "ownerName">,
): string {
  const list = taskAssignees(task);
  if (!list.length) return "Unassigned";
  if (list.length === 1) return list[0]!.name;
  return list.map((a) => a.name).join(", ");
}

export function taskAssignedToUser(
  task: Pick<Task, "assignees" | "ownerUserId" | "ownerName">,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return taskAssignees(task).some((a) => a.userId === userId);
}

export function parseAssigneesJson(raw: string | null | undefined): TaskAssignee[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sanitizeAssignees(
      parsed.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          userId: typeof row.userId === "string" ? row.userId : null,
          name: typeof row.name === "string" ? row.name : "",
        };
      }),
    );
  } catch {
    return [];
  }
}

export function assigneesToJson(assignees: TaskAssignee[]): string {
  return JSON.stringify(sanitizeAssignees(assignees));
}

export function taskStatusFromFollowUp(fu: FollowUp): TaskStatus {
  return followUpIsDone(fu.done) ? "completed" : "todo";
}

export function followUpDoneFromTaskStatus(status: TaskStatus): boolean {
  return status === "completed";
}

/** Lead hourglass: open Task rows + legacy journal tasks not yet backfilled. */
export function leadWaitingOnUs(
  followUps: FollowUp[] | undefined,
  linkedTasks: Task[] | undefined,
): boolean {
  if (linkedTasks?.some((t) => t.status !== "completed")) return true;
  const mirrored = new Set(
    (linkedTasks ?? [])
      .map((t) => t.journalFollowUpId)
      .filter((id): id is string => !!id),
  );
  return (
    followUps?.some(
      (f) =>
        isUserTask(f) &&
        !followUpIsDone(f.done) &&
        !mirrored.has(f.id),
    ) ?? false
  );
}

export function formatTaskDeadline(
  deadline: string | null | undefined,
  today = todayIsoDate(),
): { label: string; overdue: boolean; softOverdue: boolean } {
  if (!deadline) return { label: "", overdue: false, softOverdue: false };
  if (deadline === today) return { label: "Today", overdue: false, softOverdue: false };
  const d = new Date(`${deadline}T12:00:00`);
  const label = Number.isNaN(d.getTime())
    ? deadline
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (deadline < today) {
    return { label: "Overdue", overdue: true, softOverdue: true };
  }
  return { label, overdue: false, softOverdue: false };
}

export function taskMatchesFilter(
  task: Task,
  filter: "all" | "mine" | "open" | "overdue",
  currentUserId: string | null | undefined,
  today = todayIsoDate(),
): boolean {
  if (filter === "mine") {
    if (!taskAssignedToUser(task, currentUserId)) return false;
  }
  if (filter === "open" && task.status === "completed") return false;
  if (
    filter === "overdue" &&
    (!task.deadline ||
      task.deadline >= today ||
      task.status === "completed" ||
      task.status === "ongoing")
  ) {
    return false;
  }
  return true;
}

export function taskMatchesSearch(
  task: Task,
  raw: string,
  leadLabel?: string | null,
): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const blob = [
    task.title,
    ...taskAssignees(task).map((a) => a.name),
    leadLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

export function journalTaskFollowUps(followUps: FollowUp[] | undefined): FollowUp[] {
  return (followUps ?? []).filter((f) => resolveFollowUpKind(f) === "task");
}

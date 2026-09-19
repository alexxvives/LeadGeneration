import type { FollowUp, Task, TaskStatus } from "@/lib/types";
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
    if (!currentUserId || task.ownerUserId !== currentUserId) return false;
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
    task.ownerName,
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

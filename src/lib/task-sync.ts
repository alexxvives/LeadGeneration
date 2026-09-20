import type { LeadRepository } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";
import type { Contact, FollowUp, Lead, Task, TaskAssignee, TaskStatus } from "@/lib/types";
import {
  canonicalizeFollowUp,
  followUpIsDone,
  isUserTask,
  resolveFollowUpKind,
  withFollowUpAuthor,
} from "@/lib/follow-ups";
import {
  followUpDoneFromTaskStatus,
  leadWaitingOnUs,
  taskStatusFromFollowUp,
  syncOwnerFromAssignees,
} from "@/lib/tasks";

export function taskFromFollowUp(
  fu: FollowUp,
  ctx: {
    workspaceId: string;
    boardId: string;
    leadId: string | null;
    contactId: string | null;
    ownerUserId?: string | null;
    ownerName?: string | null;
  },
): Task {
  const now = nowIso();
  const name = fu.authorName?.trim() || ctx.ownerName?.trim() || null;
  const assignees: TaskAssignee[] =
    name || ctx.ownerUserId
      ? [{ userId: ctx.ownerUserId ?? null, name: name || "Member" }]
      : [];
  const owner = syncOwnerFromAssignees(assignees);
  return {
    id: newId("task"),
    workspaceId: ctx.workspaceId,
    boardId: ctx.boardId,
    title: fu.note.trim() || "Task",
    ownerUserId: owner.ownerUserId,
    ownerName: owner.ownerName,
    assignees,
    deadline: fu.date || null,
    status: taskStatusFromFollowUp(fu),
    leadId: ctx.leadId,
    contactId: ctx.contactId,
    journalFollowUpId: fu.id,
    createdAt: now,
    updatedAt: now,
  };
}

/** Mirror journal task lines ↔ Task rows after followUps change. */
export async function reconcileTasksForFollowUps(
  db: LeadRepository,
  entity: Pick<Lead, "id" | "workspaceId" | "boardId" | "followUps"> & {
    contactId?: string | null;
  },
  followUps: FollowUp[],
  actor?: { userId?: string | null; name?: string | null },
): Promise<Task[]> {
  const leadId = entity.contactId ? null : entity.id;
  const contactId = entity.contactId ?? null;
  const existing = (await db.listTasks(entity.boardId)).filter((t) =>
    leadId ? t.leadId === leadId : t.contactId === contactId,
  );
  const byJournal = new Map(
    existing
      .filter((t) => t.journalFollowUpId)
      .map((t) => [t.journalFollowUpId!, t]),
  );
  const journalIds = new Set<string>();
  const out: Task[] = [];

  for (const raw of followUps) {
    const fu = canonicalizeFollowUp(raw);
    if (resolveFollowUpKind(fu) !== "task") continue;
    journalIds.add(fu.id);
    const prev = byJournal.get(fu.id);
    // Journal drives completion; reopening from journal always → todo.
    const nextStatus: TaskStatus = followUpIsDone(fu.done)
      ? "completed"
      : "todo";
    if (prev) {
      const updated = await db.updateTask(prev.id, {
        title: fu.note.trim() || "Task",
        deadline: fu.date || null,
        status: nextStatus,
        ownerName: fu.authorName?.trim() || prev.ownerName,
        updatedAt: nowIso(),
      });
      if (updated) out.push(updated);
    } else {
      const created = await db.createTask(
        taskFromFollowUp(fu, {
          workspaceId: entity.workspaceId,
          boardId: entity.boardId,
          leadId,
          contactId,
          ownerUserId: actor?.userId,
          ownerName: actor?.name,
        }),
      );
      out.push(created);
    }
  }

  for (const t of existing) {
    if (t.journalFollowUpId && !journalIds.has(t.journalFollowUpId)) {
      await db.deleteTask(t.id);
    }
  }

  return out;
}

/** Push Task status into the linked journal line. */
export function patchFollowUpFromTask(
  followUps: FollowUp[],
  task: Task,
): FollowUp[] | null {
  if (!task.journalFollowUpId) return null;
  const idx = followUps.findIndex((f) => f.id === task.journalFollowUpId);
  if (idx === -1) return null;
  const fu = followUps[idx]!;
  const done = followUpDoneFromTaskStatus(task.status);
  const note = task.title.trim() || fu.note;
  const date = task.deadline || fu.date;
  if (fu.done === done && fu.note === note && fu.date === date) return null;
  const next = [...followUps];
  next[idx] = { ...fu, done, note, date, kind: "task" };
  return next;
}

/** Remove journal line when a mirrored Task is deleted. */
export function removeFollowUpForTask(
  followUps: FollowUp[],
  task: Task,
): FollowUp[] | null {
  if (!task.journalFollowUpId) return null;
  const next = followUps.filter((f) => f.id !== task.journalFollowUpId);
  return next.length === followUps.length ? null : next;
}

/** Add a journal task line when creating/updating a linked Task from the Tasks view. */
export function appendJournalTaskLine(
  followUps: FollowUp[],
  task: Task,
  actorName?: string | null,
): FollowUp[] {
  const fu = withFollowUpAuthor(
    {
      id: task.journalFollowUpId ?? newId("fu"),
      date: task.deadline || nowIso().slice(0, 10),
      note: task.title.trim() || "Task",
      done: followUpDoneFromTaskStatus(task.status),
      kind: "task",
    },
    actorName,
  );
  if (task.journalFollowUpId) {
    const idx = followUps.findIndex((f) => f.id === task.journalFollowUpId);
    if (idx >= 0) {
      const next = [...followUps];
      next[idx] = fu;
      return next;
    }
  }
  return [fu, ...followUps];
}

export async function backfillTasksFromJournal(
  db: LeadRepository,
  boardId?: string | null,
): Promise<void> {
  const existing = await db.listTasks(boardId || undefined);
  const linked = new Set(
    existing.map((t) => t.journalFollowUpId).filter((id): id is string => !!id),
  );

  const leads = await db.listLeads(boardId ? { boardId } : undefined);
  for (const lead of leads) {
    for (const raw of lead.followUps ?? []) {
      const fu = canonicalizeFollowUp(raw);
      if (!isUserTask(fu) || linked.has(fu.id)) continue;
      await db.createTask(
        taskFromFollowUp(fu, {
          workspaceId: lead.workspaceId,
          boardId: lead.boardId,
          leadId: lead.id,
          contactId: null,
        }),
      );
      linked.add(fu.id);
    }
  }

  const contacts = await db.listContacts(boardId || undefined);
  for (const contact of contacts) {
    for (const raw of contact.followUps ?? []) {
      const fu = canonicalizeFollowUp(raw);
      if (!isUserTask(fu) || linked.has(fu.id)) continue;
      await db.createTask(
        taskFromFollowUp(fu, {
          workspaceId: contact.workspaceId,
          boardId: contact.boardId,
          leadId: null,
          contactId: contact.id,
        }),
      );
      linked.add(fu.id);
    }
  }
}

export async function computeLeadWaitingOnUs(
  db: LeadRepository,
  lead: Pick<Lead, "id" | "followUps">,
): Promise<boolean> {
  const tasks = (await db.listTasks()).filter((t) => t.leadId === lead.id);
  return leadWaitingOnUs(lead.followUps, tasks);
}

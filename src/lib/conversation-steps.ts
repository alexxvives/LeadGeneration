import type {
  ConversationBucket,
  ConversationStep,
  CrmStage,
  FollowUp,
  Lead,
  Task,
} from "@/lib/types";
import { normalizeConversationStep } from "@/lib/types";
import {
  addDaysIso,
  followUpIsDone,
  hasPendingTask,
  resolveFollowUpKind,
  todayIsoDate,
} from "@/lib/follow-ups";

/** Days without a journal touch before an in-conversation lead is Unresponsive. */
export const UNRESPONSIVE_AFTER_DAYS = 14;

export const CONVERSATION_STEPS: readonly {
  id: ConversationStep;
  label: string;
  hint: string;
  /** Tailwind classes for the round step mark on conversation cards. */
  bubbleClass: string;
  /** Column dot on the conversation pipeline. */
  dotClass: string;
}[] = [
  {
    id: "evaluating",
    label: "Evaluating",
    hint: "They're weighing the offer.",
    bubbleClass: "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/45",
    dotClass: "bg-amber-400",
  },
  {
    id: "waiting_on_demo",
    label: "Waiting on demo",
    hint: "A demo is scheduled or still owed.",
    bubbleClass: "bg-sky-400/20 text-sky-200 ring-1 ring-sky-400/40",
    dotClass: "bg-sky-400",
  },
  {
    id: "reviewing_contract",
    label: "Reviewing contract",
    hint: "Proposal or contract is with them.",
    bubbleClass: "bg-violet-400/20 text-violet-200 ring-1 ring-violet-400/40",
    dotClass: "bg-violet-400",
  },
  {
    id: "onboarding",
    label: "Onboarding",
    hint: "Excel and invoice.",
    bubbleClass: "bg-aurora-400/20 text-aurora-200 ring-1 ring-aurora-400/40",
    dotClass: "bg-aurora-300",
  },
  {
    id: "pending_delivery",
    label: "Pending delivery",
    hint: "Agreed — waiting to deliver.",
    bubbleClass: "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/40",
    dotClass: "bg-emerald-400",
  },
];

export const UNRESPONSIVE_BUCKET = {
  id: "unresponsive" as const,
  label: "Unresponsive",
  hint: "No journal touch in over two weeks, and no open task.",
  bubbleClass: "bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/40",
  dotClass: "bg-rose-400",
};

const STEP_BY_ID = new Map(CONVERSATION_STEPS.map((s) => [s.id, s]));

export function conversationStepMeta(step: ConversationStep) {
  return STEP_BY_ID.get(step) ?? CONVERSATION_STEPS[0]!;
}

export function conversationBucketMeta(bucket: ConversationBucket) {
  if (bucket === "unresponsive") return UNRESPONSIVE_BUCKET;
  return conversationStepMeta(bucket);
}

export function isConversationStep(raw: string): raw is ConversationStep {
  return normalizeConversationStep(raw) != null;
}

/**
 * Newest journal day that counts as a touch. Open follow-up reminders are
 * excluded — they are a plan, not contact. Future dates are ignored.
 */
export function latestConversationTouchDate(
  followUps: FollowUp[] | undefined,
  today = todayIsoDate(),
): string | null {
  let best: string | null = null;
  for (const fu of followUps ?? []) {
    const kind = resolveFollowUpKind(fu);
    if (kind === "follow_up" && !followUpIsDone(fu.done)) continue;
    if (!fu.date || fu.date > today) continue;
    if (!best || fu.date > best) best = fu.date;
  }
  return best;
}

export function isConversationUnresponsive(
  lead: Pick<Lead, "followUps" | "conversationStepAt">,
  tasks?: Task[],
  today = todayIsoDate(),
): boolean {
  if (hasPendingTask(lead.followUps, tasks)) return false;
  const cutoff = addDaysIso(-UNRESPONSIVE_AFTER_DAYS);
  const touch = latestConversationTouchDate(lead.followUps, today);
  const placed = lead.conversationStepAt?.slice(0, 10) || null;
  const latest = [touch, placed].filter((d): d is string => !!d).sort().at(-1) ?? null;
  // Never touched and never placed — treat as cold.
  if (!latest) return true;
  return latest < cutoff;
}

/** Column this in-conversation lead belongs in. Others fall back to their stored step. */
export function conversationBucket(
  lead: Pick<Lead, "crmStage" | "followUps" | "conversationStep" | "conversationStepAt">,
  tasks?: Task[],
  today = todayIsoDate(),
): ConversationBucket {
  const stored = lead.conversationStep ?? "evaluating";
  if ((lead.crmStage ?? "new") !== "in_conversation") return stored;
  if (isConversationUnresponsive(lead, tasks, today)) return "unresponsive";
  return stored;
}

/**
 * Entering In Conversation without a step lands in Evaluating.
 * Setting a step refreshes `conversationStepAt` so Unresponsive does not
 * immediately reclaim the card.
 */
export function conversationStepPatch(
  lead: Pick<Lead, "crmStage" | "conversationStep" | "conversationStepAt">,
  patch: {
    crmStage?: CrmStage;
    conversationStep?: ConversationStep | null;
    conversationStepAt?: string | null;
  },
  today: string,
): { conversationStep?: ConversationStep; conversationStepAt?: string } {
  const stage = patch.crmStage ?? lead.crmStage;
  if (stage !== "in_conversation") return {};
  if (patch.conversationStep) {
    return {
      conversationStep: patch.conversationStep,
      conversationStepAt: (patch.conversationStepAt ?? today).slice(0, 10),
    };
  }
  if (!lead.conversationStep) {
    return {
      conversationStep: "evaluating",
      conversationStepAt: (lead.conversationStepAt ?? today).slice(0, 10),
    };
  }
  return {};
}

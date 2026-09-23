import type {
  ConversationStep,
  CrmStage,
  FollowUp,
  Lead,
  Outreach,
  Task,
} from "@/lib/types";
import { normalizeConversationStep } from "@/lib/types";
import {
  addDaysIso,
  hasPendingTask,
  resolveFollowUpKind,
  todayIsoDate,
} from "@/lib/follow-ups";

/** Days without a touch before a lead is marked unresponsive. */
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
    id: "evaluating_pre_demo",
    label: "Evaluating · pre-demo",
    hint: "They're weighing the offer before a demo.",
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
    id: "evaluating_post_demo",
    label: "Evaluating · post-demo",
    hint: "They've seen the demo and are still deciding.",
    bubbleClass: "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/40",
    dotClass: "bg-emerald-400",
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
];

const STEP_BY_ID = new Map(CONVERSATION_STEPS.map((s) => [s.id, s]));

export function conversationStepMeta(step: ConversationStep) {
  return STEP_BY_ID.get(step) ?? CONVERSATION_STEPS[0]!;
}

export function isConversationStep(raw: string): raw is ConversationStep {
  return normalizeConversationStep(raw) === raw;
}

/**
 * Newest journal day that counts as a touch: a note, call, send, or task.
 * Follow-up reminders never count, done or not — they are a plan, not contact.
 * Future dates are ignored.
 */
export function latestConversationTouchDate(
  followUps: FollowUp[] | undefined,
  today = todayIsoDate(),
): string | null {
  let best: string | null = null;
  for (const fu of followUps ?? []) {
    if (resolveFollowUpKind(fu) === "follow_up") continue;
    if (!fu.date || fu.date > today) continue;
    if (!best || fu.date > best) best = fu.date;
  }
  return best;
}

/**
 * Quiet lead: no note, call, send, or task in 14 days, and no open task.
 * Follow-up reminders do not count. Moving the card into a step does not
 * erase an older note — the step date only fills in when there is no contact
 * history, so a card filed today does not flash unresponsive. New leads are
 * untouched, not unresponsive.
 */
export function isConversationUnresponsive(
  lead: Pick<Lead, "crmStage" | "followUps" | "conversationStepAt"> & {
    outreach?: Pick<Outreach, "sentAt"> | null;
  },
  tasks?: Task[],
  today = todayIsoDate(),
): boolean {
  const stage = lead.crmStage ?? "new";
  if (stage === "new") return false;
  if (hasPendingTask(lead.followUps, tasks)) return false;
  const cutoff = addDaysIso(-UNRESPONSIVE_AFTER_DAYS, new Date(`${today}T12:00:00`));
  const touch = latestConversationTouchDate(lead.followUps, today);
  const sent = lead.outreach?.sentAt?.slice(0, 10) || null;
  const contact =
    [touch, sent].filter((d): d is string => !!d).sort().at(-1) ?? null;
  if (contact) return contact < cutoff;
  const placed = lead.conversationStepAt?.slice(0, 10) || null;
  if (placed) return placed < cutoff;
  return stage === "in_conversation";
}

/** Column this in-conversation lead belongs in. */
export function conversationBucket(
  lead: Pick<Lead, "conversationStep">,
): ConversationStep {
  return lead.conversationStep ?? "evaluating_pre_demo";
}

/**
 * Entering In Conversation without a step lands in Evaluating · pre-demo.
 * Setting a step refreshes `conversationStepAt` so a card with no contact
 * history does not look unresponsive the same day. An older note still wins.
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
      conversationStep: "evaluating_pre_demo",
      conversationStepAt: (lead.conversationStepAt ?? today).slice(0, 10),
    };
  }
  return {};
}

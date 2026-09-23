# 0041. Conversation steps revised — Unresponsive is a flag
- Status: accepted
- Date: 2026-09-23
- Supersedes: the step list and Unresponsive column in [0040](0040-conversation-steps.md)

## Context
Pending delivery was not a real moment in the deal. Evaluating happens twice:
before a demo and after one. A separate Unresponsive column pulled cards out
of the step they were actually in.

## Decision
In-conversation columns, in order:

1. Evaluating · pre-demo
2. Waiting on demo
3. Evaluating · post-demo
4. Reviewing contract
5. Onboarding (Excel / invoice)

Stored on `leads.conversation_step`. Legacy `evaluating` reads as pre-demo.
Legacy `pending_delivery` reads as onboarding. No new migration — the column
is already free text.

Unresponsive is not a column and not a drop target. It is true for any lead
except New when there is no open task and the latest real touch (note, call,
email, or completed task) or send date is more than 14 days ago. Follow-up
reminders never count, open or done. Filing the card into a step does not
erase that date — `conversation_step_at` only stands in when the lead has no
contact history, so a card just filed does not flash the clock. An In
Conversation lead with neither contact history nor a step date is
unresponsive. Pipeline cards show a bare rose clock. Conversation cards use the same round badge as the step mark, in rose. The card itself stays the normal surface.
The lead stays in its step.

## Alternatives considered
- A sixth stored step between demo and contract, plus a single Evaluating.
  Rejected — post-demo evaluating is that step.
- Keep Unresponsive as a column that only hides on the conversations page.
  Rejected — the stage and the stall are independent.
- Mark untouched New leads unresponsive. Rejected — New means not contacted.

## Consequences
- `ConversationBucket` is gone. The column id is the stored step.
- Setting a step still stores `conversation_step_at`, but that date does not
  override an older note, call, or send.
- Prod already has migration 0040. This change is a deploy of worker code.

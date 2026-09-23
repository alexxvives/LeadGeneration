# 0040. In-conversation steps on the pipeline
- Status: superseded in part by [0041](0041-conversation-steps-revised.md) (step list + Unresponsive column)
- Date: 2026-09-23

## Context
In Conversation was one column plus a Demo done flag. Deals actually move
through a few distinct moments after the first reply, and a stalled thread
should leave the active columns without a manual pass.

## Decision
Pipeline has a Stages / In conversation toggle. The conversation board shows
only `crmStage === "in_conversation"` leads in this order:

1. Evaluating
2. Waiting on demo
3. Reviewing contract
4. Onboarding (Excel / invoice)
5. Pending delivery
6. Unresponsive

The first five are stored on `leads.conversation_step`. Unresponsive is
derived: latest journal touch (or the date the step was last set) is more
than 14 days ago, and there is no open task. Dragging to a stored step sets
`conversation_step_at` to today so the card does not fall straight back.
Unresponsive is not a drop target.

The drawer’s Demo done toggle is gone. In Conversation shows “Where they
are” as selectable tags, the same way Contacted shows how you reached them.
Conversation cards use a colored step mark instead of the demo icon, and
no longer show a Follow-up chip.

## Alternatives considered
- Keep Demo done as a boolean beside the steps. Rejected — the step replaces it.
- Store Unresponsive as a sixth step. Rejected — it has to turn on and off
  from note age and tasks without someone remembering to move the card.
- A separate Conversations kanban route. Rejected — the toggle keeps one
  pipeline page.

## Consequences
- Migration **0040** adds `conversation_step` and `conversation_step_at`.
  Prod board queries select those columns, so deploy needs `cf:migrate`
  in the same window.
- `demoDone` remains on the row for old data and is unused in the UI.
- A lead with no journal and no step date is Unresponsive until placed.

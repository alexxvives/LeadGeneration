# 0022. Board ↔ outreach profile alignment
- Status: accepted
- Date: 2026-08-05
- Updated: 2026-08-06
- Amends: [0014](0014-boards.md), [0021](0021-per-profile-sending-identity.md)

## Context

Brands are modeled as outreach profiles (voice + Easy From/keys). Users often
run one brand per board. Without a link, switching boards left the wrong
profile active — drafts and sends used the wrong From/key. Distinct From
addresses usually mean distinct Resend accounts → distinct webhook signing
secrets (still one Hermes endpoint URL).

Showing both Board and Profile pickers in the sidebar made the relationship
unclear. Users expected “pick a board” to imply the brand.

## Decision

1. **`Board.outreachProfileId`** (nullable) — preferred outreach profile for
   that board.
2. **Selecting a board** activates that profile in the client (when set).
3. **Sidebar shows Board only** — no separate profile picker; profile follows
   the board.
4. **New boards** create an empty outreach profile with the **same name** and
   link it immediately (fill pitch / From in Settings).
5. **Send** resolves Easy identity from the lead’s board profile first, then
   workspace `activeId` / legacy columns.
6. **Webhooks:** still one Hermes URL; each Resend **account** (API key) gets
   its own registration + secret stored on that profile — not one dashboard
   webhook per board.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Profile only, no board link | Easy to send from the wrong brand |
| Optional link + dual sidebar pickers | Confusing; profile felt independent of board |
| Webhook URL per board | Unnecessary; tags already route events |
| Share one profile across many boards by default | Wrong From/key when brands differ |

## Consequences

- Migration `0029_board_outreach_profile.sql`.
- `createOutreachProfileAsync` syncs profile to workspace before `createBoard`.
- Boards UI shows linked profile + “Fill in Settings”; legacy boards can create
  a matching profile on demand.
- Sidebar `ProfilePicker` removed from Studio chrome (component may remain unused).

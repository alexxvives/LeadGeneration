# 0030. Board lock: compact Live chip + take control
- Status: accepted
- Date: 2026-08-24
- Amends: [0015](0015-board-sharing-soft-lock.md)

## Context
Exclusive board locks (ADR 0015) still prevent two people from clobbering CRM
state. The full-width “X is editing — view only until they leave” banner felt
like a hard lockout. Collaborators wanted a way to start working without
waiting for the other session to expire.

## Decision
- Keep the exclusive soft lock (heartbeat ~20s, TTL ~2.5m, writes 423).
- When someone else holds it, show a compact **Live** chip beside the page
  title with their name and **Take control**.
- Take control force-steals the lock (`POST …/lock { takeover: true }`). The
  previous holder becomes view-only on their next heartbeat.
- No request-and-wait: we have no realtime channel to ping the other person.

This matches exclusive-resource UIs (spreadsheet checkout, Live Share “take
control”) rather than Google Docs simultaneous edit, which we still cannot do
without OT/CRDT.

## Alternatives considered
- Request control and wait — rejected; no websocket to notify/yield.
- Last-write-wins — already rejected in 0015.
- Drop the lock entirely — rejected; silent CRM overwrites.

## Consequences
- Previous holder can lose in-flight drawer edits if they save after steal.
- Heartbeat shortened to 20s so a steal is noticed quickly.

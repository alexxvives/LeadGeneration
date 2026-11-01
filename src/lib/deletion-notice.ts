import type { Deletion } from "@/lib/types";

/** "just now" / "3 min ago" / "2 h ago" — tombstones live ~1 day. */
export function deletedAgo(iso: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(ms / 60_000);
  if (!Number.isFinite(min) || min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

export function deletionNoticeText(
  d: Deletion,
  what: "board" | "lead",
  now: number = Date.now(),
): string {
  const who = d.deletedByName?.trim() || "another user";
  const name = d.entityName?.trim();
  const label = what === "board" ? "This board" : "This lead";
  return `${name ? `${label} (${name})` : label} was deleted by ${who} ${deletedAgo(d.deletedAt, now)}.`;
}

/** Tombstone for a board the user is viewing, if another user deleted it. */
export function findBoardDeletion(
  deletions: Deletion[] | undefined,
  boardId: string | null,
): Deletion | null {
  if (!boardId) return null;
  return (
    deletions?.find((d) => d.entityType === "board" && d.entityId === boardId) ?? null
  );
}

/**
 * Tombstone explaining why an open lead vanished: the lead itself, or a
 * "clear board" on its board after the drawer opened.
 */
export function findLeadDeletion(
  deletions: Deletion[] | undefined,
  lead: { id: string; boardId?: string | null },
  openedAtIso: string,
): Deletion | null {
  if (!deletions?.length) return null;
  return (
    deletions.find((d) => d.entityType === "lead" && d.entityId === lead.id) ??
    deletions.find(
      (d) =>
        d.entityType === "board_leads" &&
        !!lead.boardId &&
        d.entityId === lead.boardId &&
        d.deletedAt >= openedAtIso,
    ) ??
    null
  );
}

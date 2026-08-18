import type { FollowUp } from "@/lib/types";

/** True for "Email sent" and "Email sent by …". */
export function isEmailSentNote(note: string): boolean {
  return /^email sent\b/i.test(note.trim());
}

/**
 * One journal line per day for sends. Named "Email sent by …" wins over a
 * bare "Email sent" (the drawer heal used to add a second row).
 */
export function collapseEmailSentFollowUps(
  followUps: FollowUp[],
  actorName?: string | null,
): FollowUp[] {
  const name = actorName?.trim() || null;
  const winnerIdByDate = new Map<string, string>();
  for (const f of followUps) {
    if (!isEmailSentNote(f.note)) continue;
    const existingId = winnerIdByDate.get(f.date);
    if (!existingId) {
      winnerIdByDate.set(f.date, f.id);
      continue;
    }
    const named = /^email sent by\b/i.test(f.note.trim());
    if (!named) continue;
    const prev = followUps.find((x) => x.id === existingId);
    const prevNamed = prev ? /^email sent by\b/i.test(prev.note.trim()) : false;
    if (!prevNamed) winnerIdByDate.set(f.date, f.id);
  }
  return followUps.flatMap((f) => {
    if (!isEmailSentNote(f.note)) return [f];
    if (winnerIdByDate.get(f.date) !== f.id) return [];
    if (/^email sent$/i.test(f.note.trim()) && name) {
      return [{ ...f, note: `Email sent by ${name}` }];
    }
    return [f];
  });
}

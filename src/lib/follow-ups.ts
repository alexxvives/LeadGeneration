import type { FollowUp, FollowUpKind, LeadWithOutreach } from "@/lib/types";

/** Local calendar day (YYYY-MM-DD), not UTC — follow-ups are “today” in the user’s timezone. */
export function todayIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "1st March 2025" style for note journal lines. */
export function formatNoteDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const ord =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = d.toLocaleString("en-GB", { month: "long" });
  return `${day}${ord} ${month} ${d.getFullYear()}`;
}

/** True for "Email sent" and "Email sent by …". */
export function isEmailSentNote(note: string): boolean {
  return /^email sent\b/i.test(note.trim());
}

export function isPhoneCallNote(note: string): boolean {
  const t = note.trim().toLowerCase();
  if (t.startsWith("phone call by")) return true;
  if (t.startsWith("missed call by")) return true;
  if (t.startsWith("contacted by phone")) return true;
  if (t.startsWith("called")) return true;
  if (t.startsWith("logged as called")) return true;
  return t.startsWith("contacted via") && /\bphone\b/.test(t);
}

export function isMissedCallNote(note: string): boolean {
  return /^missed call by\b/i.test(note.trim());
}

export function callNoteActor(name?: string | null): string {
  const t = name?.trim();
  return t || "you";
}

export function phoneCallNotePrefix(name?: string | null): string {
  return `Phone call by ${callNoteActor(name)}: `;
}

export function missedCallNotePrefix(name?: string | null): string {
  return `Missed call by ${callNoteActor(name)}: `;
}

/** Strip a connected/missed call prefix so we can switch Connected ↔ Missed. */
export function stripCallNotePrefix(note: string): string {
  return note
    .replace(/^phone call by [^:]+:\s*/i, "")
    .replace(/^missed call by [^:]+:\s*/i, "");
}

export function inferFollowUpKind(note: string): FollowUpKind {
  if (isEmailSentNote(note)) return "email";
  if (isPhoneCallNote(note)) return "phone";
  return "follow_up";
}

export function resolveFollowUpKind(fu: FollowUp): FollowUpKind {
  return fu.kind ?? inferFollowUpKind(fu.note);
}

/** User-authored reminder — not an auto-logged send or call. */
export function isUserFollowUp(fu: FollowUp): boolean {
  return resolveFollowUpKind(fu) === "follow_up";
}

export function followUpKindLabel(kind: FollowUpKind): string {
  if (kind === "email") return "Email sent";
  if (kind === "phone") return "Phone call";
  return "Follow-up";
}

export interface CalendarEvent {
  id: string;
  leadId: string;
  company: string;
  date: string;
  note: string;
  done: boolean;
  kind: FollowUpKind;
}

export function calendarEventsFromLeads(
  leads: LeadWithOutreach[],
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const lead of leads) {
    for (const fu of lead.followUps ?? []) {
      out.push({
        id: fu.id,
        leadId: lead.id,
        company: lead.company,
        date: fu.date,
        note: fu.note,
        done: fu.done,
        kind: resolveFollowUpKind(fu),
      });
    }
  }
  return out;
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
      return [{ ...f, note: `Email sent by ${name}`, kind: "email" }];
    }
    return [{ ...f, kind: f.kind ?? "email" }];
  });
}

import type { Contact, FollowUp, FollowUpKind, LeadWithOutreach } from "@/lib/types";

/** Local calendar day (YYYY-MM-DD), not UTC — follow-ups are “today” in the user’s timezone. */
export function todayIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar day `days` after `d` (local date, not UTC). */
export function addDaysIso(days: number, d = new Date()): string {
  return todayIsoDate(
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + days),
  );
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
  if (t.startsWith("phone call")) return true;
  if (t.startsWith("missed call")) return true;
  if (t.startsWith("contacted by phone")) return true;
  if (t.startsWith("called")) return true;
  if (t.startsWith("logged as called")) return true;
  return t.startsWith("contacted via") && /\bphone\b/.test(t);
}

export function isMissedCallNote(note: string): boolean {
  return /^missed call\b/i.test(note.trim());
}

export function leadHasMissedCall(
  lead: Pick<LeadWithOutreach, "followUps">,
): boolean {
  return (lead.followUps ?? []).some((f) => isMissedCallNote(f.note));
}

export function isBounceNote(note: string): boolean {
  return /^email bounced\b/i.test(note.trim());
}

/** Legacy empty-channel fallback (removed 2026-08-18). Also “ — {name}”. */
export function isContactRegisteredNote(note: string): boolean {
  return /^contact registered(?:\s*[—–-].*)?$/i.test(note.trim());
}

export function phoneCallNotePrefix(_name?: string | null): string {
  void _name;
  return "Phone call: ";
}

export function missedCallNotePrefix(_name?: string | null): string {
  void _name;
  return "Missed call";
}

export function emailSentNotePrefix(_name?: string | null): string {
  void _name;
  return "Email sent";
}

/** Drop a trailing colon when the missed-call line has no extra body. */
export function normalizeMissedCallNote(note: string): string {
  if (!isMissedCallNote(note)) return note;
  return note.trim().replace(/:\s*$/, "");
}

/** Drop a trailing colon when the email-sent line has no extra body. */
export function normalizeEmailSentNote(note: string): string {
  if (!isEmailSentNote(note)) return note;
  return note.trim().replace(/:\s*$/, "");
}

/** Strip a connected/missed call prefix so we can switch Connected ↔ Missed. */
export function stripCallNotePrefix(note: string): string {
  return note
    .replace(/^phone call(?:\s+by [^:]+)?(?::\s*)?/i, "")
    .replace(/^missed call(?:\s+by [^:]+)?(?::\s*)?/i, "");
}

export function inferFollowUpKind(note: string): FollowUpKind {
  if (isBounceNote(note)) return "note";
  if (isEmailSentNote(note)) return "email";
  if (isPhoneCallNote(note)) return "phone";
  return "note";
}

/** Composer default (“Follow up”) or the auto “Reply received” reminder. */
function looksLikeFollowUpReminder(note: string): boolean {
  const t = note.trim();
  if (/^follow[\s-]?up\b/i.test(t)) return true;
  if (/^reply received$/i.test(t)) return true;
  return false;
}

export function resolveFollowUpKind(fu: FollowUp): FollowUpKind {
  // Card-list rows strip note text; trust the kind we persisted at slim time.
  if (!fu.note?.trim() && fu.kind) return fu.kind;
  const inferred = inferFollowUpKind(fu.note);
  // Call / send / bounce text wins over a stored kind — logging a phone
  // call via Follow up used to save kind: follow_up (the checkbox).
  if (inferred === "phone" || inferred === "email") return inferred;
  if (isBounceNote(fu.note)) return "note";
  if (
    fu.kind === "note" ||
    fu.kind === "email" ||
    fu.kind === "phone" ||
    fu.kind === "task"
  ) {
    return fu.kind;
  }
  // Explicit Follow up control: default copy, or a future date (composer +7d).
  // Older drawer notes were stored as kind: follow_up — those are notes.
  if (fu.kind === "follow_up") {
    if (looksLikeFollowUpReminder(fu.note)) return "follow_up";
    if (fu.date > todayIsoDate()) return "follow_up";
    return "note";
  }
  return "note";
}

const NOTE_PREVIEW_MAX = 140;

/**
 * Card-list journal: keep id/date/done/kind (Pipeline chips + Calendar dots).
 * Missed-call prefix stays so `leadHasMissedCall` still works. Note / follow-up
 * kinds keep a short preview so Conversations cards can show recent comments.
 */
export function slimFollowUpsForList(followUps: FollowUp[]): FollowUp[] {
  return followUps.map((raw) => {
    const f = canonicalizeFollowUp(raw);
    const kind = resolveFollowUpKind(f);
    const missed = isMissedCallNote(f.note);
    const keepPreview =
      kind === "note" || kind === "follow_up" || kind === "task";
    const trimmed = f.note.trim();
    const note = missed
      ? trimmed.replace(/:[\s\S]*$/, "")
      : keepPreview
        ? trimmed.slice(0, NOTE_PREVIEW_MAX)
        : "";
    return {
      id: f.id,
      date: f.date,
      done: f.done,
      kind,
      note,
      ...(f.authorName?.trim() ? { authorName: f.authorName.trim() } : {}),
    };
  });
}

/** Newest date first, then newest id — display only; storage order is unchanged. */
export function sortFollowUpsNewestFirst(followUps: FollowUp[]): FollowUp[] {
  return [...followUps].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

/** User-authored reminder — not a note, send, call, or bounce. */
export function isUserFollowUp(fu: FollowUp): boolean {
  return resolveFollowUpKind(fu) === "follow_up";
}

/** Card chips: only undone reminders. Done follow-ups stay in the journal. */
export function pendingUserFollowUpCount(
  followUps: FollowUp[] | undefined,
): number {
  return followUps?.filter((f) => isUserFollowUp(f) && !f.done).length ?? 0;
}

const TITLE_RE = /^(dr|dra|mr|mrs|ms|miss|prof|sr|sra|srta)\.?$/i;

/** Initials for the comment avatar (skip Dr./Mr. so Vicente Paloma → VP). */
export function authorInitials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p && !TITLE_RE.test(p));
  if (parts.length === 0) {
    const fallback = (name ?? "").trim();
    return fallback ? fallback.slice(0, 2).toUpperCase() : "?";
  }
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/** Stored author, or a name peeled from legacy “by …” / “— name” copy. */
export function followUpAuthorName(fu: FollowUp): string | null {
  const stored = fu.authorName?.trim();
  if (stored && !/^you$/i.test(stored)) return stored;
  return peelActorFromNote(fu.note).authorName;
}

/**
 * Pull a person off legacy journal copy and leave a name-free line.
 * “Email sent by Alex” → { Email sent, Alex }; “Contacted via Organic / web — ana” → Organic.
 */
export function peelActorFromNote(note: string): {
  note: string;
  authorName: string | null;
} {
  const t = note.replace(/\s+/g, " ").trim();
  if (!t) return { note: "", authorName: null };

  const take = (name: string | undefined, rest: string) => {
    const who = name?.trim() ?? "";
    const authorName = who && !/^you$/i.test(who) ? who : null;
    return { note: rest.replace(/:\s*$/, "").trim(), authorName };
  };

  let m = t.match(/^(email sent) by\s+([^:]+?)(?::\s*(.*))?$/i);
  if (m) {
    const rest = m[3]?.trim();
    return take(m[2], rest ? `${m[1]}: ${rest}` : m[1]!);
  }
  m = t.match(/^(missed call) by\s+([^:]+?)(?::\s*(.*))?$/i);
  if (m) {
    const rest = m[3]?.trim();
    return take(m[2], rest ? `${m[1]}: ${rest}` : m[1]!);
  }
  m = t.match(/^(phone call) by\s+([^:]+?)(?::\s*(.*))?$/i);
  if (m) {
    const rest = m[3]?.trim();
    return take(m[2], rest ? `${m[1]}: ${rest}` : m[1]!);
  }
  m = t.match(/^(contacted via .+?)\s+[—–-]\s+(.+)$/i);
  if (m) return take(m[2], m[1]!);

  return { note: t.replace(/:\s*$/, ""), authorName: null };
}

function tidyChannelCopy(note: string): string {
  return note
    .replace(/\bOrganic\s*\/\s*web\b/gi, "Organic")
    .replace(/:\s*$/, "")
    .trim();
}

/** Name-free journal line + authorName. Safe to run on every read/write. */
export function canonicalizeFollowUp(fu: FollowUp): FollowUp {
  const peeled = peelActorFromNote(fu.note ?? "");
  const note = tidyChannelCopy(peeled.note);
  const stored = fu.authorName?.trim();
  const authorName =
    stored && !/^you$/i.test(stored) ? stored : peeled.authorName;
  if (
    note === (fu.note ?? "") &&
    (authorName ?? null) === (fu.authorName?.trim() || null)
  ) {
    return fu;
  }
  return {
    ...fu,
    note,
    ...(authorName ? { authorName } : { authorName: fu.authorName }),
  };
}

export function withFollowUpAuthor(
  fu: FollowUp,
  actorName?: string | null,
): FollowUp {
  if (fu.authorName?.trim()) return fu;
  const name = actorName?.trim();
  return name ? { ...fu, authorName: name } : fu;
}

export function followUpKindLabel(kind: FollowUpKind): string {
  if (kind === "email") return "Email sent";
  if (kind === "phone") return "Phone call";
  if (kind === "note") return "Note";
  if (kind === "task") return "Task";
  return "Follow up";
}

/** Undone reminder whose date is at least one local day before today. */
export function isOverdueFollowUp(
  date: string,
  done: boolean,
  today = todayIsoDate(),
): boolean {
  return !done && date < today;
}

export interface CalendarEvent {
  id: string;
  source: "lead" | "contact";
  leadId: string;
  contactId?: string;
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
      const kind = resolveFollowUpKind(fu);
      if (kind === "note" || kind === "task") continue;
      const canon = canonicalizeFollowUp(fu);
      out.push({
        id: canon.id,
        source: "lead",
        leadId: lead.id,
        company: lead.company,
        date: canon.date,
        note: canon.note,
        done: canon.done,
        kind,
      });
    }
  }
  return out;
}

export function calendarEventsFromContacts(contacts: Contact[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const contact of contacts) {
    for (const fu of contact.followUps ?? []) {
      const kind = resolveFollowUpKind(fu);
      if (kind === "note" || kind === "task") continue;
      const canon = canonicalizeFollowUp(fu);
      out.push({
        id: canon.id,
        source: "contact",
        leadId: "",
        contactId: contact.id,
        company: contact.name,
        date: canon.date,
        note: canon.note,
        done: canon.done,
        kind,
      });
    }
  }
  return out;
}

/**
 * Drop a second bare "Email sent" on the same day. Names live on authorName
 * now — do not rewrite the line to “Email sent by …”.
 */
export function collapseEmailSentFollowUps(
  followUps: FollowUp[],
  actorName?: string | null,
): FollowUp[] {
  const seenBareDates = new Set<string>();
  return followUps.flatMap((raw) => {
    const f = withFollowUpAuthor(canonicalizeFollowUp(raw), actorName);
    if (!isEmailSentNote(f.note)) return [f];
    const isBare = /^email sent$/i.test(f.note.trim());
    if (!isBare) return [{ ...f, kind: f.kind ?? "email" }];
    if (seenBareDates.has(f.date)) return [];
    seenBareDates.add(f.date);
    return [{ ...f, kind: f.kind ?? "email" }];
  });
}

/**
 * Reconcile a cached journal with a server/slim snapshot.
 * Never drops rows the cache already has (optimistic create), and skips
 * `droppedIds` so a stale poll cannot resurrect a delete. Incoming-only
 * rows (e.g. webhook “Reply received”) are appended.
 */
export function mergeFollowUpLists(
  cached: FollowUp[],
  incoming: FollowUp[],
  droppedIds?: ReadonlySet<string> | null,
  opts?: { preferIncoming?: boolean; patchExisting?: boolean },
): FollowUp[] {
  if (cached.length === 0 && incoming.length === 0) return incoming;
  if (incoming.length === 0) {
    const kept = droppedIds?.size
      ? cached.filter((f) => !droppedIds.has(f.id))
      : cached;
    return kept.map(canonicalizeFollowUp);
  }
  if (cached.length === 0) {
    const kept = droppedIds?.size
      ? incoming.filter((f) => !droppedIds.has(f.id))
      : incoming;
    return kept.map(canonicalizeFollowUp);
  }
  // Full drawer GET: restore note bodies. Keep cached-only ids (optimistic add).
  if (opts?.preferIncoming) {
    const incomingIds = new Set<string>();
    const out: FollowUp[] = [];
    for (const f of incoming) {
      if (droppedIds?.has(f.id)) continue;
      incomingIds.add(f.id);
      out.push(canonicalizeFollowUp(f));
    }
    for (const f of cached) {
      if (droppedIds?.has(f.id) || incomingIds.has(f.id)) continue;
      out.push(canonicalizeFollowUp(f));
    }
    return out;
  }
  const incomingById = new Map(incoming.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const out: FollowUp[] = [];
  const patchExisting = opts?.patchExisting === true;
  for (const f of cached) {
    if (droppedIds?.has(f.id)) continue;
    seen.add(f.id);
    const inc = patchExisting ? incomingById.get(f.id) : undefined;
    if (!inc) {
      out.push(canonicalizeFollowUp(f));
      continue;
    }
    const cf = canonicalizeFollowUp(f);
    const ic = canonicalizeFollowUp(inc);
    const note =
      cf.note.trim().length >= ic.note.trim().length ? cf.note : ic.note;
    out.push({
      ...cf,
      date: ic.date || cf.date,
      done: ic.done,
      kind: ic.kind ?? cf.kind,
      note,
      authorName: ic.authorName?.trim() || cf.authorName,
    });
  }
  for (const f of incoming) {
    if (seen.has(f.id) || droppedIds?.has(f.id)) continue;
    seen.add(f.id);
    out.push(canonicalizeFollowUp(f));
  }
  return out;
}

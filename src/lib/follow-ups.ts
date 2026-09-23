import type { Contact, FollowUp, FollowUpKind, LeadWithOutreach, Task } from "@/lib/types";

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
    fu.kind === "task" ||
    fu.kind === "follow_up"
  ) {
    return fu.kind;
  }
  if (looksLikeFollowUpReminder(fu.note)) return "follow_up";
  if (fu.date > todayIsoDate()) return "follow_up";
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
      done: followUpIsDone(f.done),
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

/** SQLite / JSON may store 0/1; missing `done` is not completed. */
export function followUpIsDone(done: unknown): boolean {
  return done === true || done === 1;
}

/** Card chips: only undone reminders. Done follow-ups stay in the journal. */
export function pendingUserFollowUpCount(
  followUps: FollowUp[] | undefined,
): number {
  return (
    followUps?.filter((f) => isUserFollowUp(f) && !followUpIsDone(f.done))
      .length ?? 0
  );
}

/** Work we owe them — drives the Waiting on us hourglass, not a separate flag. */
export function isUserTask(fu: FollowUp): boolean {
  return resolveFollowUpKind(fu) === "task";
}

export function pendingTaskCount(followUps: FollowUp[] | undefined): number {
  return (
    followUps?.filter((f) => isUserTask(f) && !followUpIsDone(f.done)).length ??
    0
  );
}

export function hasPendingTask(
  followUps: FollowUp[] | undefined,
  linkedTasks?: Task[],
): boolean {
  if (linkedTasks?.some((t) => t.status !== "completed")) return true;
  const mirrored = new Set(
    (linkedTasks ?? [])
      .map((t) => t.journalFollowUpId)
      .filter((id): id is string => !!id),
  );
  return (
    followUps?.some(
      (f) =>
        isUserTask(f) &&
        !followUpIsDone(f.done) &&
        !mirrored.has(f.id),
    ) ?? false
  );
}

/** Mark the newest open task done. `null` if none are pending. */
export function markNewestPendingTaskDone(
  followUps: FollowUp[],
): FollowUp[] | null {
  const open = sortFollowUpsNewestFirst(followUps).find(
    (f) => isUserTask(f) && !followUpIsDone(f.done),
  );
  if (!open) return null;
  return followUps.map((f) =>
    f.id === open.id ? { ...f, done: true } : f,
  );
}

/** Mark the newest open follow-up reminder done. `null` if none are pending. */
export function markNewestPendingFollowUpDone(
  followUps: FollowUp[],
): FollowUp[] | null {
  const open = sortFollowUpsNewestFirst(followUps).find(
    (f) => isUserFollowUp(f) && !followUpIsDone(f.done),
  );
  if (!open) return null;
  return followUps.map((f) =>
    f.id === open.id ? { ...f, done: true } : f,
  );
}

function journalDateToMs(iso: string): number {
  const d = new Date(`${iso}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Sort key for “last touch” — journal lines + outbound send time. */
export function lastContactTimestamp(
  lead: Pick<LeadWithOutreach, "followUps" | "outreach" | "createdAt">,
): { at: number; precision: "datetime" | "date" } {
  let at = new Date(lead.createdAt).getTime();
  let precision: "datetime" | "date" = Number.isNaN(at) ? "date" : "datetime";
  if (Number.isNaN(at)) at = 0;

  for (const fu of lead.followUps ?? []) {
    const kind = resolveFollowUpKind(fu);
    if (
      kind !== "email" &&
      kind !== "phone" &&
      kind !== "note" &&
      kind !== "follow_up" &&
      kind !== "task"
    ) {
      continue;
    }
    const ms = journalDateToMs(fu.date);
    if (ms > at) {
      at = ms;
      precision = "date";
    }
  }

  const sent = lead.outreach?.sentAt;
  if (sent) {
    const ms = new Date(sent).getTime();
    if (!Number.isNaN(ms) && ms > at) {
      at = ms;
      precision = "datetime";
    }
  }

  return { at, precision };
}

/** Human label for the most recent contact on a conversation card. */
export function formatLastContact(
  lead: Pick<LeadWithOutreach, "followUps" | "outreach" | "createdAt">,
): string {
  const { at, precision } = lastContactTimestamp(lead);
  if (!at) return "";
  const d = new Date(at);
  if (precision === "date") {
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const done = followUpIsDone(fu.done);
  if (
    note === (fu.note ?? "") &&
    done === fu.done &&
    (authorName ?? null) === (fu.authorName?.trim() || null)
  ) {
    return fu;
  }
  return {
    ...fu,
    note,
    done,
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
  return !followUpIsDone(done) && date < today;
}

export interface CalendarEvent {
  id: string;
  source: "lead" | "contact" | "task";
  leadId: string;
  contactId?: string;
  taskId?: string;
  company: string;
  date: string;
  note: string;
  done: boolean;
  kind: FollowUpKind;
  /** Task row status when source === "task". */
  taskStatus?: Task["status"];
}

export function calendarEventsFromLeads(
  leads: LeadWithOutreach[],
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const lead of leads) {
    for (const fu of lead.followUps ?? []) {
      const kind = resolveFollowUpKind(fu);
      if (kind === "task") continue;
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
      if (kind === "task") continue;
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

export function calendarEventsFromTasks(
  tasks: Task[],
  leadLabels: Map<string, string>,
  contactLabels: Map<string, string>,
  mirroredJournalIds: ReadonlySet<string>,
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const task of tasks) {
    if (!task.deadline) continue;
    if (
      task.journalFollowUpId &&
      mirroredJournalIds.has(task.journalFollowUpId)
    ) {
      // Prefer Task entity — skip duplicate journal row.
    }
    const company =
      (task.leadId && leadLabels.get(task.leadId)) ||
      (task.contactId && contactLabels.get(task.contactId)) ||
      "Task";
    out.push({
      id: task.id,
      source: "task",
      leadId: task.leadId ?? "",
      contactId: task.contactId ?? undefined,
      taskId: task.id,
      company,
      date: task.deadline,
      note: task.title,
      done: task.status === "completed",
      kind: "task",
      taskStatus: task.status,
    });
  }
  return out;
}

/** Legacy journal tasks without a Task row — include once until backfilled. */
export function calendarEventsFromLegacyJournalTasks(
  leads: LeadWithOutreach[],
  contacts: Contact[],
  mirroredJournalIds: ReadonlySet<string>,
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const lead of leads) {
    for (const fu of lead.followUps ?? []) {
      const kind = resolveFollowUpKind(fu);
      if (kind !== "task" || mirroredJournalIds.has(fu.id)) continue;
      const canon = canonicalizeFollowUp(fu);
      out.push({
        id: canon.id,
        source: "lead",
        leadId: lead.id,
        company: lead.company,
        date: canon.date,
        note: canon.note,
        done: canon.done,
        kind: "task",
        taskStatus: canon.done ? "completed" : "todo",
      });
    }
  }
  for (const contact of contacts) {
    for (const fu of contact.followUps ?? []) {
      const kind = resolveFollowUpKind(fu);
      if (kind !== "task" || mirroredJournalIds.has(fu.id)) continue;
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
        kind: "task",
        taskStatus: canon.done ? "completed" : "todo",
      });
    }
  }
  return out;
}

/**
 * Stable id for the automatic “Email sent” line. Send and the drawer heal
 * share it so a race cannot insert two rows for the same lead and day.
 */
export function emailSentFollowUpId(leadId: string, date: string): string {
  return `fu-email-${leadId}-${date}`;
}

/**
 * Bare “Email sent” (or a slim board row whose body was stripped) on this day.
 * A line with extra detail (“Email sent: pricing”) is kept.
 */
function bareEmailSentDate(f: FollowUp): string | null {
  const note = f.note.trim();
  if (/^email sent$/i.test(note)) return f.date;
  if (!note && f.kind === "email") return f.date;
  return null;
}

/** True when this day already has the automatic send line (including a slim shell). */
export function hasEmailSentOn(followUps: FollowUp[], date: string): boolean {
  return followUps.some((raw) => {
    const f = canonicalizeFollowUp(raw);
    return bareEmailSentDate(f) === date || (
      f.date === date && isEmailSentNote(f.note)
    );
  });
}

/**
 * Drop a second bare "Email sent" on the same day. Names live on authorName
 * now — do not rewrite the line to “Email sent by …”.
 * Prefer a row that still has body text over a slim empty shell.
 */
export function collapseEmailSentFollowUps(
  followUps: FollowUp[],
  actorName?: string | null,
): FollowUp[] {
  const keptByDate = new Map<string, FollowUp>();
  const out: FollowUp[] = [];
  for (const raw of followUps) {
    const f = withFollowUpAuthor(canonicalizeFollowUp(raw), actorName);
    const day = bareEmailSentDate(f);
    if (!day) {
      out.push(f.kind === "email" || isEmailSentNote(f.note) ? { ...f, kind: f.kind ?? "email" } : f);
      continue;
    }
    const tagged = { ...f, kind: f.kind ?? "email" as const };
    const prev = keptByDate.get(day);
    if (!prev) {
      keptByDate.set(day, tagged);
      out.push(tagged);
      continue;
    }
    if (!prev.note.trim() && tagged.note.trim()) {
      const idx = out.findIndex((row) => row.id === prev.id);
      if (idx >= 0) out[idx] = tagged;
      keptByDate.set(day, tagged);
    }
  }
  return out;
}

/** Journal JSON from the DB, with registered-contact noise and email dupes gone. */
export function parseStoredFollowUps(raw: unknown): {
  followUps: FollowUp[];
  deduped: boolean;
} {
  const list = Array.isArray(raw) ? (raw as FollowUp[]) : [];
  const mapped = list
    .filter((f) => f && !isContactRegisteredNote(f.note ?? ""))
    .map((f) => canonicalizeFollowUp({ ...f, note: f.note ?? "" }));
  const followUps = collapseEmailSentFollowUps(mapped);
  return { followUps, deduped: followUps.length < mapped.length };
}

/**
 * Slim board polls can lag a tick after the user marks a reminder done.
 * Keep completed=true unless a full GET is explicitly preferred *and* the
 * cached row is still open.
 */
function mergeFollowUpDone(cached: FollowUp, incoming: FollowUp): boolean {
  return followUpIsDone(cached.done) || followUpIsDone(incoming.done);
}

function mergeFollowUpKind(cached: FollowUp, incoming: FollowUp): FollowUpKind {
  const ck = resolveFollowUpKind(cached);
  const ik = resolveFollowUpKind(incoming);
  if (ck === "follow_up" || ck === "task") return ck;
  if (ik === "follow_up" || ik === "task") return ik;
  return ik ?? ck;
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
  const finish = (rows: FollowUp[]) => collapseEmailSentFollowUps(rows);
  if (cached.length === 0 && incoming.length === 0) return finish(incoming);
  if (incoming.length === 0) {
    const kept = droppedIds?.size
      ? cached.filter((f) => !droppedIds.has(f.id))
      : cached;
    return finish(kept.map(canonicalizeFollowUp));
  }
  if (cached.length === 0) {
    const kept = droppedIds?.size
      ? incoming.filter((f) => !droppedIds.has(f.id))
      : incoming;
    return finish(kept.map(canonicalizeFollowUp));
  }
  const cachedById = new Map(cached.map((f) => [f.id, f]));
  // Full drawer GET: restore note bodies. Keep cached-only ids (optimistic add).
  if (opts?.preferIncoming) {
    const incomingIds = new Set<string>();
    const out: FollowUp[] = [];
    for (const f of incoming) {
      if (droppedIds?.has(f.id)) continue;
      incomingIds.add(f.id);
      const prev = cachedById.get(f.id);
      const canon = canonicalizeFollowUp(f);
      out.push(
        prev
          ? {
              ...canon,
              done: mergeFollowUpDone(prev, canon),
              kind: mergeFollowUpKind(prev, canon),
            }
          : canon,
      );
    }
    for (const f of cached) {
      if (droppedIds?.has(f.id) || incomingIds.has(f.id)) continue;
      out.push(canonicalizeFollowUp(f));
    }
    return finish(out);
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
      done: mergeFollowUpDone(cf, ic),
      kind: mergeFollowUpKind(cf, ic),
      note,
      authorName: ic.authorName?.trim() || cf.authorName,
    });
  }
  for (const f of incoming) {
    if (seen.has(f.id) || droppedIds?.has(f.id)) continue;
    seen.add(f.id);
    out.push(canonicalizeFollowUp(f));
  }
  return finish(out);
}

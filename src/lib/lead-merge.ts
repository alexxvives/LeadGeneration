/**
 * Three-way merge for simultaneous lead edits.
 *
 * A client sends the fields it changed (`patch`) plus the values it started
 * from (`base`). The server compares them to what is stored now (`current`):
 *  - field untouched by anyone else (current == base) → apply the patch
 *  - both sides set the same value → no-op
 *  - both changed it differently → conflict ("Changed by X — keep yours / theirs")
 * Lists merge as add/remove sets, the journal (followUps) merges by entry id,
 * and customFields merge key by key, so non-overlapping edits never conflict.
 */

export type MergeConflict = { field: string; yours: unknown; theirs: unknown };

type Rec = Record<string, unknown>;

const SET_FIELDS = new Set(["emails", "phones", "contactMethods", "leadTree"]);

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === ""))
    return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeSet(current: unknown, base: unknown, patch: unknown): string[] {
  const cur = Array.isArray(current) ? (current as string[]) : [];
  const b = new Set(Array.isArray(base) ? (base as string[]) : []);
  const p = Array.isArray(patch) ? (patch as string[]) : [];
  const pSet = new Set(p);
  const removed = new Set([...b].filter((x) => !pSet.has(x)));
  const out = cur.filter((x) => !removed.has(x));
  for (const x of p) if (!b.has(x) && !out.includes(x)) out.push(x);
  return out;
}

type Entry = { id: string } & Rec;

function mergeById(current: unknown, base: unknown, patch: unknown): Entry[] {
  const list = (v: unknown) => (Array.isArray(v) ? (v as Entry[]) : []);
  const baseMap = new Map(list(base).map((e) => [e.id, e]));
  const patchMap = new Map(list(patch).map((e) => [e.id, e]));
  const out: Entry[] = [];
  for (const cur of list(current)) {
    const inBase = baseMap.get(cur.id);
    const inPatch = patchMap.get(cur.id);
    if (inBase && !inPatch) continue; // this client deleted it
    if (inBase && inPatch && !sameValue(inBase, inPatch)) {
      out.push(inPatch); // this client edited it (last write wins per entry)
      continue;
    }
    out.push(cur);
  }
  const have = new Set(out.map((e) => e.id));
  for (const e of list(patch)) {
    // New on this client (not in base). Entries in base but gone from current
    // were deleted by someone else — don't resurrect them.
    if (!baseMap.has(e.id) && !have.has(e.id)) out.push(e);
  }
  return out;
}

export function mergeLeadPatch(
  current: Rec,
  base: Rec,
  patch: Rec,
): { apply: Rec; conflicts: MergeConflict[] } {
  const apply: Rec = {};
  const conflicts: MergeConflict[] = [];
  for (const [field, mine] of Object.entries(patch)) {
    if (mine === undefined) continue;
    if (!(field in base)) {
      apply[field] = mine; // no base sent → last write wins
      continue;
    }
    const was = base[field];
    const now = current[field];
    if (SET_FIELDS.has(field)) {
      apply[field] = mergeSet(now, was, mine);
      continue;
    }
    if (field === "followUps") {
      apply[field] = mergeById(now, was, mine);
      continue;
    }
    if (field === "customFields") {
      const cur = (now ?? {}) as Record<string, string>;
      const b = (was ?? {}) as Record<string, string>;
      const p = (mine ?? {}) as Record<string, string>;
      const out: Record<string, string> = { ...cur };
      for (const key of new Set([...Object.keys(b), ...Object.keys(p)])) {
        if (sameValue(b[key], p[key])) continue; // this client didn't touch it
        if (sameValue(cur[key], b[key]) || sameValue(cur[key], p[key])) {
          if (p[key] === undefined) delete out[key];
          else out[key] = p[key];
        } else {
          conflicts.push({ field: `customFields.${key}`, yours: p[key] ?? null, theirs: cur[key] ?? null });
        }
      }
      apply[field] = out;
      continue;
    }
    if (sameValue(now, was) || sameValue(now, mine)) {
      apply[field] = mine;
    } else {
      conflicts.push({ field, yours: mine, theirs: now ?? null });
    }
  }
  return { apply, conflicts };
}

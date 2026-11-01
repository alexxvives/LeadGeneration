/**
 * Short bulk lock (import / Find leads / bulk delete) + refresh-safe drafts.
 * Run: npx esbuild scripts/tests/bulk-lock.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/bl.mjs && node --experimental-sqlite /tmp/bl.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { D1Store } from "@/lib/db/d1-store";
import { acquireBulkLock, releaseBulkLock, getBoardLockStatus, type Ctx } from "@/lib/service";
import { BoardLockedError } from "@/lib/errors";
import { adoptServerValue, editDraft, markSaved, type DraftState } from "@/lib/draft-sync";
import { mergeSlimIntoCached } from "@/lib/lead-cache";
import { NO_TRIAL_TREE as NT, toggleTreeStep } from "@/lib/lead-tree";
import type { LeadWithOutreach } from "@/lib/types";

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log("PASS", name);
}

/** Minimal D1 shim over node:sqlite. */
function d1(sql: DatabaseSync) {
  const stmt = (q: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(q, a),
    first: async <T>() => (sql.prepare(q).get(...(args as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: sql.prepare(q).all(...(args as never[])) as T[] }),
    run: async () => {
      const r = sql.prepare(q).run(...(args as never[]));
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: (q: string) => stmt(q) } as never;
}

const sql = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  try {
    sql.exec(readFileSync(`migrations/${f}`, "utf8"));
  } catch {
    /* some migrations need D1-only features */
  }
}
const cols = sql.prepare("PRAGMA table_info(board_locks)").all() as { name: string }[];
assert.ok(cols.some((c) => c.name === "kind"), "migration 0045 adds board_locks.kind");
sql.exec("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('ws', 'T', '2026-01-01', '2026-01-01')");
sql.exec("INSERT INTO boards (id, workspace_id, name, created_at, updated_at) VALUES ('b1', 'ws', 'B', '2026-01-01', '2026-01-01')");
const store = new D1Store(d1(sql), "ws");
const ctxFor = (userId: string, userName: string): Ctx => ({
  db: store, workspaceId: "ws", metered: false, userId, userEmail: null, userName,
  scopeToWorkspace: () => store,
});
const alex = ctxFor("u_alex", "Alex");
const ona = ctxFor("u_ona", "Ona");

await test("migration 0045 purges expired lock rows only", () => {
  const s2 = new DatabaseSync(":memory:");
  s2.exec("CREATE TABLE board_locks (board_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, user_name TEXT, locked_at TEXT NOT NULL, expires_at TEXT NOT NULL)");
  s2.exec("INSERT INTO board_locks VALUES ('old','u','U','2020-01-01T00:00:00.000Z','2020-01-01T00:02:30.000Z'), ('live','u','U','2026-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')");
  s2.exec(readFileSync("migrations/0045_bulk_board_locks.sql", "utf8"));
  const left = (s2.prepare("SELECT board_id FROM board_locks").all() as { board_id: string }[]).map((r) => r.board_id);
  assert.deepEqual(left, ["live"]);
});

await test("acquire → other user blocked with a clear message → release frees it", async () => {
  const lock = await acquireBulkLock(alex, "b1", "import", 60_000);
  assert.equal(lock?.kind, "import");
  // Ona sees the notice through the board status (Alex himself does not).
  assert.equal((await getBoardLockStatus(ona, "b1"))?.userName, "Alex");
  assert.equal((await getBoardLockStatus(alex, "b1"))?.kind ?? null, null);
  await assert.rejects(
    () => acquireBulkLock(ona, "b1", "search", 60_000),
    (e: unknown) =>
      e instanceof BoardLockedError &&
      e.kind === "import" &&
      /^Alex is importing leads on this board/.test(e.message),
  );
  // Same user re-acquiring (next import chunk) refreshes instead of failing.
  await acquireBulkLock(alex, "b1", "import", 60_000);
  // Ona's release must not drop Alex's lock.
  await releaseBulkLock(ona, "b1");
  assert.ok(await getBoardLockStatus(ona, "b1"));
  await releaseBulkLock(alex, "b1");
  assert.equal(await getBoardLockStatus(ona, "b1"), null);
  assert.ok(await acquireBulkLock(ona, "b1", "delete", 60_000));
  await releaseBulkLock(ona, "b1");
});

await test("expired lock (client vanished) is taken over and purged on acquire", async () => {
  sql.exec("INSERT INTO board_locks (board_id, user_id, user_name, kind, locked_at, expires_at) VALUES ('b1','u_alex','Alex','search','2020-01-01T00:00:00.000Z','2020-01-01T00:10:00.000Z')");
  sql.exec("INSERT INTO board_locks (board_id, user_id, user_name, kind, locked_at, expires_at) VALUES ('stale','u_x','X',NULL,'2020-01-01T00:00:00.000Z','2020-01-01T00:02:30.000Z')");
  assert.equal(await getBoardLockStatus(ona, "b1"), null, "expired lock is not reported");
  const lock = await acquireBulkLock(ona, "b1", "import", 60_000);
  assert.equal(lock?.userId, "u_ona");
  const n = (sql.prepare("SELECT COUNT(*) AS n FROM board_locks").get() as { n: number }).n;
  assert.equal(n, 1, "expired rows deleted on acquire");
  await releaseBulkLock(ona, "b1");
});

await test("anonymous ctx never locks", async () => {
  assert.equal(await acquireBulkLock({ ...alex, userId: null }, "b1", "import", 60_000), null);
});

await test("refresh never overwrites a focused or dirty note draft", () => {
  let s: DraftState = { value: "server v1", focused: false, dirty: false };
  s = adoptServerValue(s, "server v2");
  assert.equal(s.value, "server v2", "idle field follows the server");
  s = { ...s, focused: true };
  s = adoptServerValue(s, "teammate edit");
  assert.equal(s.value, "server v2", "focused field keeps its text");
  s = editDraft(s, "my unsaved note");
  s = { ...s, focused: false }; // blurred but save not acknowledged yet
  s = adoptServerValue(s, "teammate edit 2");
  assert.equal(s.value, "my unsaved note", "dirty draft survives the 10s refresh");
  s = markSaved(s);
  s = adoptServerValue(s, "my unsaved note");
  assert.equal(s.value, "my unsaved note");
  s = adoptServerValue(s, "later teammate edit");
  assert.equal(s.value, "later teammate edit", "after save it follows the server again");
});

await test("refresh never reverts an unsaved lead-tree tick", () => {
  const base = {
    id: "L1", company: "Acme", crmStage: "new", contactMethods: [], emails: [], phones: [],
    followUps: [], customFields: {}, leadTree: [], outreach: null,
  } as unknown as LeadWithOutreach;
  // My tick is optimistic and its PATCH is in flight.
  let cache: LeadWithOutreach = {
    ...base, leadTree: toggleTreeStep([], NT.contract.id, true), lastWriteAt: 5, writePending: true,
  };
  // A 10s poll that STARTED after my tick still can't revert it while pending.
  cache = mergeSlimIntoCached(cache, { ...base, leadTree: [] }, { fetchStartedAt: 10 });
  assert.deepEqual(cache.leadTree, [NT.contract.id]);
  // Once acknowledged, a newer poll (teammate's tick) is adopted.
  cache = { ...cache, writePending: false };
  cache = mergeSlimIntoCached(cache, { ...base, leadTree: [NT.contract.id, NT.paid.id] }, { fetchStartedAt: 20 });
  assert.deepEqual(cache.leadTree, [NT.contract.id, NT.paid.id]);
});

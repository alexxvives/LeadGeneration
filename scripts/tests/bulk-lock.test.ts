/**
 * Short bulk lock (import / Find leads / bulk delete) + refresh-safe drafts.
 * Run: npx esbuild scripts/tests/bulk-lock.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/bl.mjs && node --experimental-sqlite /tmp/bl.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { D1Store } from "@/lib/db/d1-store";
import {
  acquireBulkLock,
  releaseBulkLock,
  renewBulkLock,
  getBoardLockStatus,
  recordDeletions,
  listRecentDeletions,
  BULK_LOCK_TTL_MS,
  type Ctx,
} from "@/lib/service";
import { startBulkLockKeepalive, type KeepaliveDeps } from "@/lib/bulk-lock-keepalive";
import { deletionNoticeText, findBoardDeletion, findLeadDeletion } from "@/lib/deletion-notice";
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
  assert.equal(lock.lock?.kind, "import");
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
  assert.equal(lock.lock?.userId, "u_ona");
  const n = (sql.prepare("SELECT COUNT(*) AS n FROM board_locks").get() as { n: number }).n;
  assert.equal(n, 1, "expired rows deleted on acquire");
  await releaseBulkLock(ona, "b1");
});

await test("anonymous ctx never locks", async () => {
  assert.equal((await acquireBulkLock({ ...alex, userId: null }, "b1", "import", 60_000)).lock, null);
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

await test("lock TTL is short (≤ 60s) so a crashed tab frees the board within a minute", () => {
  assert.ok(BULK_LOCK_TTL_MS <= 60_000);
});

await test("heartbeat renews only your own lock", async () => {
  await acquireBulkLock(alex, "b1", "import", 1_000);
  const before = (await store.getBoardLock("b1"))!.expiresAt;
  assert.equal(await renewBulkLock(alex, "b1"), true);
  const after = (await store.getBoardLock("b1"))!.expiresAt;
  assert.ok(after > before, "expiry pushed out");
  assert.equal(await renewBulkLock(ona, "b1"), false, "Ona can't extend Alex's lock");
  await releaseBulkLock(alex, "b1");
  assert.equal(await renewBulkLock(alex, "b1"), false, "released lock is not resurrected");
});

await test("bulk delete during your own import keeps the import lock", async () => {
  await acquireBulkLock(alex, "b1", "import", 60_000);
  const del = await acquireBulkLock(alex, "b1", "delete", 60_000);
  assert.equal(del.nested, true);
  await del.release();
  const held = await getBoardLockStatus(ona, "b1");
  assert.equal(held?.kind, "import", "import lock still held after the nested delete");
  await assert.rejects(() => acquireBulkLock(ona, "b1", "delete", 60_000), BoardLockedError);
  await releaseBulkLock(alex, "b1");
});

await test("tab close: pagehide finalizes, then beacons a release and stops the heartbeat", () => {
  const posts: { url: string; body: string; beacon: boolean }[] = [];
  let tick: (() => void) | null = null;
  let hide: (() => void) | null = null;
  let cleared = false;
  const deps: KeepaliveDeps = {
    setInterval: (fn) => ((tick = fn), 1),
    clearInterval: () => {
      cleared = true;
    },
    addPageHide: (fn) => (hide = fn),
    removePageHide: () => (hide = null),
    post: (url, body, { beacon }) => posts.push({ url, body, beacon }),
  };
  const order: string[] = [];
  startBulkLockKeepalive("b 1", { deps, onPageHide: () => order.push("finalize") });
  tick!();
  assert.deepEqual(posts[0], { url: "/api/boards/b%201/lock", body: '{"action":"renew"}', beacon: false });
  hide!();
  order.push("release");
  assert.deepEqual(order, ["finalize", "release"]);
  assert.deepEqual(posts[1], { url: "/api/boards/b%201/lock", body: '{"action":"release"}', beacon: true });
  assert.ok(cleared, "heartbeat stopped");
  assert.equal(hide, null, "listener removed");
});

await test("normal finish: stop() sends nothing and detaches", () => {
  const posts: string[] = [];
  let hide: (() => void) | null = null;
  const stop = startBulkLockKeepalive("b1", {
    deps: {
      setInterval: () => 1,
      clearInterval: () => {},
      addPageHide: (fn) => (hide = fn),
      removePageHide: () => (hide = null),
      post: (_u, body) => posts.push(body),
    },
  });
  stop();
  assert.equal(hide, null);
  assert.deepEqual(posts, []);
});

await test("deletions: recorded with who/when, others see them, own are hidden, old pruned", async () => {
  sql.exec("INSERT INTO deletions (id, entity_type, entity_id, board_id, deleted_by_id, deleted_by_name, deleted_at) VALUES ('lead:old','lead','old','b1','u_ona','Ona','2020-01-01T00:00:00.000Z')");
  await recordDeletions(ona, [
    { entityType: "lead", entityId: "L1", entityName: "Acme", boardId: "b1" },
    { entityType: "board", entityId: "b2", entityName: "Madrid", boardId: "b2" },
  ]);
  const ids = (sql.prepare("SELECT entity_id FROM deletions ORDER BY entity_id").all() as { entity_id: string }[]).map((r) => r.entity_id);
  assert.deepEqual(ids, ["L1", "b2"], "row older than a day pruned on write");
  const seen = await listRecentDeletions(alex, { boardIds: ["b1"] });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].deletedByName, "Ona");
  assert.equal(seen[0].entityName, "Acme");
  assert.deepEqual(await listRecentDeletions(ona, { boardIds: ["b1"] }), [], "own deletions not shown");
  const board = await listRecentDeletions(alex, { entityIds: ["b2"] });
  assert.equal(findBoardDeletion(board, "b2")?.deletedByName, "Ona");
  // Bulk deletes (> 12 rows → several INSERT chunks) all land.
  await recordDeletions(ona, Array.from({ length: 30 }, (_, i) => ({ entityType: "lead" as const, entityId: `B${i}`, boardId: "b3" })));
  assert.equal((await listRecentDeletions(alex, { boardIds: ["b3"] })).length, 30);
});

await test("notice text + matching the open lead", () => {
  const now = Date.parse("2026-11-01T17:00:00.000Z");
  const d = { entityType: "lead" as const, entityId: "L1", entityName: "Acme", boardId: "b1", deletedById: "u_ona", deletedByName: "Ona", deletedAt: "2026-11-01T16:59:40.000Z" };
  assert.equal(deletionNoticeText(d, "lead", now), "This lead (Acme) was deleted by Ona just now.");
  assert.equal(deletionNoticeText({ ...d, entityType: "board", entityName: "Madrid", deletedAt: "2026-11-01T16:55:00.000Z" }, "board", now), "This board (Madrid) was deleted by Ona 5 min ago.");
  assert.equal(findLeadDeletion([d], { id: "L1", boardId: "b1" }, "2026-11-01T16:00:00.000Z"), d);
  const clear = { ...d, entityType: "board_leads" as const, entityId: "b1", entityName: null };
  assert.equal(findLeadDeletion([clear], { id: "L9", boardId: "b1" }, "2026-11-01T16:00:00.000Z"), clear);
  assert.equal(findLeadDeletion([clear], { id: "L9", boardId: "b1" }, "2026-11-01T17:00:00.000Z"), null, "older board clear doesn't explain a lead opened later");
  assert.equal(findLeadDeletion([d], { id: "L2", boardId: "b1" }, "2026-11-01T16:00:00.000Z"), null);
});

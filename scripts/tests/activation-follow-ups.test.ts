import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import {
  addDaysIso,
  addMonthsIso,
  followUpDates,
  followUpTaskId,
} from "@/lib/activation-follow-ups";
import { syncActivationFollowUps } from "@/lib/service";
import type { Task } from "@/lib/types";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => console.log("PASS", name));
}

await test("date calc", () => {
  assert.equal(addDaysIso("2026-12-28", 7), "2027-01-04");
  assert.equal(addMonthsIso("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsIso("2027-01-31", 13), "2028-02-29");
  const d = followUpDates("2026-10-30");
  assert.deepEqual(d, {
    w1: "2026-11-06",
    m1: "2026-11-30",
    m6: "2027-04-30",
    y1: "2027-10-30",
    y2: "2028-10-30",
    y3: "2029-10-30",
  });
});

await test("task upsert idempotent (real migrations + SQL)", async () => {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
    try {
      sql.exec(readFileSync(`migrations/${f}`, "utf8"));
    } catch {
      /* some migrations need D1-only features; tasks table must still exist */
    }
  }
  sql.exec("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('ws', 'Test', '2026-01-01', '2026-01-01')");
  const upsert = sql
    .prepare(
      `INSERT INTO tasks (id, workspace_id, board_id, title, owner_user_id, owner_name, assignees_json,
        deadline, status, lead_id, contact_id, journal_follow_up_id, highlight, created_at, updated_at)
       VALUES (?, 'ws', ?, ?, NULL, NULL, '[]', ?, ?, ?, NULL, NULL, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, deadline = excluded.deadline,
         highlight = 1, updated_at = excluded.updated_at
       WHERE tasks.workspace_id = excluded.workspace_id`,
    );
  const db = {
    async upsertHighlightTask(t: Task) {
      upsert.run(t.id, t.boardId, t.title, t.deadline, t.status, t.leadId, t.createdAt, t.updatedAt);
    },
  };
  const lead = { id: "L1", boardId: "B1", company: "Acme" };
  await syncActivationFollowUps(db, { customFields: {} }, { ...lead, customFields: { __activation_date: "2026-01-31" } });
  sql.prepare("UPDATE tasks SET status='completed' WHERE id=?").run(followUpTaskId("L1", "w1"));
  // Same date again → no-op; new date → updates in place.
  const same = await syncActivationFollowUps(
    db,
    { customFields: { __activation_date: "2026-01-31" } },
    { ...lead, customFields: { __activation_date: "2026-01-31" } },
  );
  assert.equal(same, 0);
  await syncActivationFollowUps(
    db,
    { customFields: { __activation_date: "2026-01-31" } },
    { ...lead, customFields: { __activation_date: "2026-03-01" } },
  );
  const rows = sql.prepare("SELECT id, deadline, status, highlight FROM tasks WHERE lead_id='L1' ORDER BY deadline").all() as {
    id: string; deadline: string; status: string; highlight: number;
  }[];
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.highlight === 1));
  assert.equal(rows[0]!.deadline, "2026-03-08");
  assert.equal(rows[0]!.status, "completed"); // status survives a date edit
  assert.equal(rows[5]!.deadline, "2029-03-01");
});

await test("european date format", async () => {
  const { formatDateEu, formatDayMonthEu, formatDateTimeEu } = await import("@/lib/date-format");
  assert.equal(formatDateEu("2026-11-04"), "04/11/2026");
  assert.equal(formatDayMonthEu("2026-11-04"), "04/11");
  assert.equal(formatDateEu(new Date(2027, 0, 9)), "09/01/2027");
  assert.equal(formatDateTimeEu(new Date(2027, 0, 9, 7, 5)), "09/01/2027 07:05");
  assert.equal(formatDateEu(""), "");
});

/**
 * Regression (2 Nov 2026): removing a lead's email left it in the unsent
 * draft's To, so the Outreach queue still showed (and could send to) it.
 * Run: npx esbuild scripts/tests/email-removal.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/er.mjs && node --experimental-sqlite /tmp/er.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { D1Store } from "@/lib/db/d1-store";
import { updateLeadCrm, type Ctx } from "@/lib/service";
import { outreachToAfterLeadEmailEdit as next } from "@/lib/outreach-recipient";
import { mergeMutationIntoCached } from "@/lib/lead-cache";
import type { Lead, LeadWithOutreach } from "@/lib/types";

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
  return { prepare: (q: string) => stmt(q), batch: async (ss: { run: () => Promise<unknown> }[]) => Promise.all(ss.map((s) => s.run())) } as never;
}

// Pure rule.
assert.equal(next("a@x.es", "draft", ["a@x.es", "b@x.es"], ["b@x.es"]), "b@x.es");
assert.equal(next("a@x.es", "draft", ["a@x.es"], []), null);
assert.equal(next("A@X.es ", "approved", ["a@x.es"], []), null);
assert.equal(next("a@x.es", "draft", [], []), null, "stale To with no lead emails is cleared");
assert.equal(next("custom@y.es", "draft", ["a@x.es"], ["b@x.es"]), undefined, "custom To kept");
assert.equal(next("b@x.es", "draft", ["a@x.es", "b@x.es"], ["b@x.es"]), undefined);
assert.equal(next("a@x.es", "sent", ["a@x.es"], []), undefined, "sent audit trail untouched");
assert.equal(next(null, "draft", ["a@x.es"], []), undefined);
console.log("PASS outreachToAfterLeadEmailEdit rule");

const sql = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  try { sql.exec(readFileSync(`migrations/${f}`, "utf8")); } catch { /* D1-only */ }
}
sql.exec("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('ws','T','2026-01-01','2026-01-01')");
sql.exec("INSERT INTO boards (id, workspace_id, name, created_at, updated_at) VALUES ('b1','ws','B','2026-01-01','2026-01-01')");
const store = new D1Store(d1(sql), "ws");
const ctx: Ctx = { db: store, workspaceId: "ws", metered: false, userId: "u_alex", userEmail: null, userName: "Alex", scopeToWorkspace: () => store };
const runCols = (sql.prepare("PRAGMA table_info(runs)").all() as { name: string; notnull: number; dflt_value: unknown }[]);
const req = ["id", ...runCols.filter((c) => c.name !== "id" && c.notnull && c.dflt_value == null).map((c) => c.name)];
const vals = req.map((c) => (c === "id" ? "'r1'" : c === "workspace_id" ? "'ws'" : c === "board_id" ? "'b1'" : c.endsWith("_count") || c === "count" ? "0" : "'x'"));
sql.exec(`INSERT INTO runs (${req.join(",")}${req.includes("board_id") ? "" : ",board_id"}) VALUES (${vals.join(",")}${req.includes("board_id") ? "" : ",'b1'"})`);
sql.exec(`INSERT INTO leads (id, run_id, company, emails, source_url, status, created_at, workspace_id, board_id)
  VALUES ('L1','r1','Depilife Albacete','["atencion-al-cliente@depilife.es","info@depilife.es"]','x','queued','2026-10-04','ws','b1')`);
sql.exec(`INSERT INTO outreach (id, lead_id, run_id, to_email, subject, body, status, created_at, updated_at, workspace_id)
  VALUES ('O1','L1','r1','atencion-al-cliente@depilife.es','s','b','draft','2026-10-11T00:00:00.000Z','2026-10-11T00:00:00.000Z','ws')`);

const saved = (await updateLeadCrm(ctx, "L1", { emails: [] })) as LeadWithOutreach;
assert.deepEqual(saved.emails, []);
const row = sql.prepare("SELECT to_email, updated_at FROM outreach WHERE id='O1'").get() as { to_email: string | null; updated_at: string };
assert.equal(row.to_email, null, "draft To must drop the removed email");
assert.ok(row.updated_at > "2026-10-11T00:00:00.000Z", "outreach updatedAt bumped so open clients merge it");
assert.equal(saved.outreach?.toEmail, null, "PATCH response carries synced outreach");
console.log("PASS removing all emails clears the draft To (D1)");

// Client merge: cached draft To is replaced by the synced one.
const cached = { id: "L1", emails: ["atencion-al-cliente@depilife.es"], followUps: [], outreach: { id: "O1", toEmail: "atencion-al-cliente@depilife.es", status: "draft", updatedAt: "2026-10-11T00:00:00.000Z" } } as unknown as LeadWithOutreach;
const merged = mergeMutationIntoCached(cached, saved as unknown as Lead, { emails: [] }, Date.now());
assert.deepEqual(merged.emails, []);
assert.equal(merged.outreach?.toEmail, null, "client cache keeps the removed email as To");
console.log("PASS client cache adopts the cleared To");

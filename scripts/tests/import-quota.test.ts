/**
 * Regression: a CSV import was blocked with
 * "Import would use 250 leads but only 0 remain" when the Agency monthly
 * search/enrichment cap was already used. Spreadsheet import must not
 * consume or check those credits.
 *
 * Run: npx esbuild scripts/tests/import-quota.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/iq.mjs && node --experimental-sqlite /tmp/iq.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { D1Store } from "@/lib/db/d1-store";
import { importLeads, type Ctx } from "@/lib/service";
import { getPlan } from "@/lib/plans";

function d1(sql: DatabaseSync) {
  const stmt = (q: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(q, a),
    first: async <T>() =>
      (sql.prepare(q).get(...(args as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: sql.prepare(q).all(...(args as never[])) as T[] }),
    run: async () => {
      const r = sql.prepare(q).run(...(args as never[]));
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (q: string) => stmt(q),
    batch: async (ss: { run: () => Promise<unknown> }[]) =>
      Promise.all(ss.map((s) => s.run())),
  } as never;
}

const sql = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((m) => m.endsWith(".sql")).sort()) {
  try {
    sql.exec(readFileSync(`migrations/${f}`, "utf8"));
  } catch {
    /* D1-only */
  }
}
sql.exec(
  "INSERT INTO workspaces (id, name, created_at, updated_at, plan_id, leads_used_this_month, resets_at) VALUES ('ws','alexxvives''s workspace','2026-07-21','2026-07-21','agency',2000,'2026-12-01T00:00:00.000Z')",
);
sql.exec(
  "INSERT INTO boards (id, workspace_id, name, created_at, updated_at) VALUES ('b1','ws','AKADEMO','2026-01-01','2026-01-01')",
);
const store = new D1Store(d1(sql), "ws");
const ctx: Ctx = {
  db: store,
  workspaceId: "ws",
  metered: true,
  userId: "u_alex",
  userEmail: "alexxvives@gmail.com",
  userName: "alexxvives",
  scopeToWorkspace: () => store,
};

const agency = getPlan("agency");
assert.equal(agency.leadCreditsPerMonth, 2000);
const usedBefore = sql.prepare("SELECT leads_used_this_month AS n FROM workspaces WHERE id='ws'").get() as { n: number };
assert.equal(usedBefore.n, 2000, "fixture starts at a full Agency cap");

const rows = Array.from({ length: 250 }, (_, i) => ({
  company: `Academia Import ${String(i + 1).padStart(3, "0")}`,
  website: `https://academia-import-${i + 1}.example.es`,
  emails: [`info${i + 1}@academia-import.es`],
  phones: [],
  location: "Madrid",
}));

const result = await importLeads(ctx, rows, { boardId: "b1" });
assert.equal(result.imported, 250, "all 250 rows should be added");
assert.equal(result.skipped + result.merged, 0);
const count = sql.prepare("SELECT COUNT(*) AS n FROM leads WHERE board_id='b1'").get() as { n: number };
assert.equal(count.n, 250);
const usedAfter = sql.prepare("SELECT leads_used_this_month AS n FROM workspaces WHERE id='ws'").get() as { n: number };
assert.equal(usedAfter.n, 2000, "CSV import must not burn monthly lead credits");
console.log("PASS 250-row CSV import succeeds at a full Agency cap and does not use credits");

// Second import of the same names: merge/skip, still no quota error, still no credit burn.
const again = await importLeads(ctx, rows, { boardId: "b1" });
assert.equal(again.imported, 0);
assert.equal(again.merged + again.skipped, 250);
const count2 = sql.prepare("SELECT COUNT(*) AS n FROM leads WHERE board_id='b1'").get() as { n: number };
assert.equal(count2.n, 250);
const usedAgain = sql.prepare("SELECT leads_used_this_month AS n FROM workspaces WHERE id='ws'").get() as { n: number };
assert.equal(usedAgain.n, 2000);
console.log("PASS re-import of the same 250 names is deduped and still unmetered");

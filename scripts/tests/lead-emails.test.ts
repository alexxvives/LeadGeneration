/**
 * Multiple emails on a lead: primary is emails[0], extras are stored on the
 * existing JSON array, and reply/bounce lookup can match a secondary address.
 * Run: npx esbuild scripts/tests/lead-emails.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/le.mjs && node --experimental-sqlite /tmp/le.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { D1Store } from "@/lib/db/d1-store";
import { updateLeadCrm, type Ctx } from "@/lib/service";
import {
  MAX_LEAD_EMAILS,
  normalizeLookupEmail,
  sanitizeEmailList,
} from "@/lib/email/address";
import type { LeadWithOutreach } from "@/lib/types";

assert.deepEqual(
  sanitizeEmailList(["A@X.es", "a@x.es", " not-an-email ", "b@x.es"]),
  ["a@x.es", "b@x.es"],
);
assert.equal(
  sanitizeEmailList(
    Array.from({ length: MAX_LEAD_EMAILS + 3 }, (_, i) => `n${i}@x.es`),
  ).length,
  MAX_LEAD_EMAILS,
);
assert.equal(normalizeLookupEmail("Name <Info@Clinic.es>"), "info@clinic.es");
assert.equal(normalizeLookupEmail("info@clinic.es"), "info@clinic.es");
console.log("PASS sanitizeEmailList + normalizeLookupEmail");

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
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  try {
    sql.exec(readFileSync(`migrations/${f}`, "utf8"));
  } catch {
    /* D1-only */
  }
}
sql.exec(
  "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('ws','T','2026-01-01','2026-01-01')",
);
sql.exec(
  "INSERT INTO boards (id, workspace_id, name, created_at, updated_at) VALUES ('b1','ws','B','2026-01-01','2026-01-01')",
);
const store = new D1Store(d1(sql), "ws");
const ctx: Ctx = {
  db: store,
  workspaceId: "ws",
  metered: false,
  userId: "u_alex",
  userEmail: null,
  userName: "Alex",
  scopeToWorkspace: () => store,
};
const runCols = sql.prepare("PRAGMA table_info(runs)").all() as {
  name: string;
  notnull: number;
  dflt_value: unknown;
}[];
const req = [
  "id",
  ...runCols
    .filter((c) => c.name !== "id" && c.notnull && c.dflt_value == null)
    .map((c) => c.name),
];
const vals = req.map((c) =>
  c === "id"
    ? "'r1'"
    : c === "workspace_id"
      ? "'ws'"
      : c === "board_id"
        ? "'b1'"
        : c.endsWith("_count") || c === "count"
          ? "0"
          : "'x'",
);
sql.exec(
  `INSERT INTO runs (${req.join(",")}${req.includes("board_id") ? "" : ",board_id"}) VALUES (${vals.join(",")}${req.includes("board_id") ? "" : ",'b1'"})`,
);

sql.exec(`INSERT INTO leads (id, run_id, company, emails, source_url, status, created_at, workspace_id, board_id)
  VALUES ('L1','r1','Clinic','["primary@clinic.es","reply@clinic.es"]','x','queued','2026-10-04','ws','b1')`);
sql.exec(`INSERT INTO leads (id, run_id, company, emails, source_url, status, created_at, workspace_id, board_id)
  VALUES ('L2','r1','Other','["info@clinic.es.au"]','x','queued','2026-10-04','ws','b1')`);
sql.exec(`INSERT INTO outreach (id, lead_id, run_id, to_email, subject, body, status, sent_at, created_at, updated_at, workspace_id)
  VALUES ('O1','L1','r1','primary@clinic.es','s','b','sent','2026-11-01T10:00:00.000Z','2026-11-01T10:00:00.000Z','2026-11-01T10:00:00.000Z','ws')`);
sql.exec(`INSERT INTO outreach (id, lead_id, run_id, to_email, subject, body, status, sent_at, created_at, updated_at, workspace_id)
  VALUES ('O2','L2','r1','info@clinic.es.au','s','b','sent','2026-11-02T10:00:00.000Z','2026-11-02T10:00:00.000Z','2026-11-02T10:00:00.000Z','ws')`);

const byPrimary = await store.findLatestSentByEmail("Primary@Clinic.es");
assert.equal(byPrimary?.id, "O1", "to_email match still wins");

const bySecondary = await store.findLatestSentByEmail(
  "Reception <reply@clinic.es>",
);
assert.equal(bySecondary?.id, "O1", "secondary lead email matches the sent outreach");

const substring = await store.findLatestSentByEmail("info@clinic.es");
assert.equal(substring, null, "substring of another lead email must not match");

const byAu = await store.findLatestSentByEmail("info@clinic.es.au");
assert.equal(byAu?.id, "O2");
console.log("PASS findLatestSentByEmail secondary + exact match");

sql.exec(`INSERT INTO leads (id, run_id, company, emails, source_url, status, created_at, workspace_id, board_id)
  VALUES ('L3','r1','Drafty','["a@x.es","b@x.es"]','x','queued','2026-10-04','ws','b1')`);
sql.exec(`INSERT INTO outreach (id, lead_id, run_id, to_email, subject, body, status, created_at, updated_at, workspace_id)
  VALUES ('O3','L3','r1','a@x.es','s','b','draft','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z','ws')`);

const saved = (await updateLeadCrm(ctx, "L3", {
  emails: ["b@x.es", "a@x.es"],
})) as LeadWithOutreach;
assert.deepEqual(saved.emails, ["b@x.es", "a@x.es"]);
assert.equal(saved.outreach?.toEmail, "b@x.es", "unsent draft To follows the new primary");
console.log("PASS updateLeadCrm primary switch updates draft To");

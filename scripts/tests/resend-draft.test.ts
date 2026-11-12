/**
 * After a send, Draft remaining must be able to write a new AKADEMO draft
 * without touching the sent outreach row (11 Nov 2026 LUMIA-text incident).
 *
 * Run: npx esbuild scripts/tests/resend-draft.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/rd.mjs && node --experimental-sqlite /tmp/rd.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { D1Store } from "@/lib/db/d1-store";
import { draftOutreach, type Ctx } from "@/lib/service";
import { pickCurrentOutreach } from "@/lib/outreach-current";
import { needsOutreachDraft, canRedraftOutreach } from "@/components/studio/OutreachView";
import type { LeadWithOutreach } from "@/lib/types";

assert.equal(
  pickCurrentOutreach([
    { status: "sent", updatedAt: "2026-11-12", createdAt: "2026-11-11", id: "old" },
    { status: "draft", updatedAt: "2026-11-12T10:00:00.000Z", createdAt: "2026-11-12", id: "new" },
  ])?.id,
  "new",
);
assert.equal(
  pickCurrentOutreach([
    { status: "sent", updatedAt: "2026-11-11", createdAt: "2026-11-11", id: "only" },
  ])?.id,
  "only",
);
console.log("PASS pickCurrentOutreach prefers an open draft over a sent row");

function d1(sql: DatabaseSync) {
  const stmt = (q: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(q, a),
    first: async <T>() =>
      (sql.prepare(q).get(...(args as never[])) ?? null) as T | null,
    all: async <T>() => ({
      results: sql.prepare(q).all(...(args as never[])) as T[],
    }),
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

const storeJson = JSON.stringify({
  activeId: "op_akademo",
  profiles: [
    {
      id: "op_akademo",
      name: "AKADEMO",
      displayName: "akademo",
      signature: "Alexandre Vives<br>CEO de AKADEMO",
      subjectTemplate: "Propuesta para {company}",
      subjects: { es: "Propuesta para {company}" },
      pitches: { es: "Buenas {company}!<br><br>En AKADEMO trabajamos con centros." },
      aiPersonalize: false,
    },
  ],
});

const sql = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  try {
    sql.exec(readFileSync(`migrations/${f}`, "utf8"));
  } catch {
    /* D1-only */
  }
}

const escaped = storeJson.replace(/'/g, "''");
sql.exec(
  `INSERT INTO workspaces (id, name, created_at, updated_at, outreach_profiles_json) VALUES ('ws','T','2026-01-01','2026-01-01','${escaped}')`,
);
sql.exec(
  "INSERT INTO boards (id, workspace_id, name, outreach_profile_id, created_at, updated_at) VALUES ('board_akademo','ws','AKADEMO','op_akademo','2026-01-01','2026-01-01')",
);

const runCols = (
  sql.prepare("PRAGMA table_info(runs)").all() as {
    name: string;
    notnull: number;
    dflt_value: unknown;
  }[]
);
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
        ? "'board_akademo'"
        : c.endsWith("_count") || c === "count"
          ? "0"
          : "'x'",
);
const runSql = req.includes("workspace_id")
  ? `INSERT INTO runs (${req.join(",")}${req.includes("board_id") ? "" : ",board_id"}) VALUES (${vals.join(",")}${req.includes("board_id") ? "" : ",'board_akademo'"})`
  : `INSERT INTO runs (${req.join(",")},workspace_id${req.includes("board_id") ? "" : ",board_id"}) VALUES (${vals.join(",")},'ws'${req.includes("board_id") ? "" : ",'board_akademo'"})`;
sql.exec(runSql);
sql.exec(
  `INSERT INTO leads (id, run_id, company, emails, source_url, status, created_at, workspace_id, board_id, crm_stage, contact_method)
  VALUES ('L1','r1','1 Sport','["secretaria@1sport.es"]','x','sent','2026-11-11','ws','board_akademo','contacted','email')`,
);
sql.exec(
  `INSERT INTO outreach (id, lead_id, run_id, to_email, subject, body, status, delivery_status, sent_at, created_at, updated_at, workspace_id)
  VALUES ('out_sent','L1','r1','secretaria@1sport.es','Propuesta para 1 Sport','Os contacto desde LUMIA SAMSUNG Ona Paradell','sent','sent','2026-11-11T10:21:27.056Z','2026-11-11T10:20:55.000Z','2026-11-11T10:21:27.056Z','ws')`,
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

const currentBefore = await store.getOutreachByLead("L1");
assert.equal(currentBefore?.id, "out_sent");
assert.equal(currentBefore?.status, "sent");

const drafted = await draftOutreach(ctx, "L1");
assert.ok(drafted);
assert.notEqual(drafted!.id, "out_sent", "must insert a new draft, not reopen the sent row");
assert.equal(drafted!.status, "draft");
assert.ok(drafted!.body.includes("AKADEMO"));
assert.equal(drafted!.body.includes("LUMIA"), false);
assert.equal(drafted!.sentAt, null);

const sent = sql.prepare("SELECT status, body, sent_at FROM outreach WHERE id='out_sent'").get() as {
  status: string;
  body: string;
  sent_at: string;
};
assert.equal(sent.status, "sent");
assert.ok(sent.body.includes("LUMIA"));
assert.equal(sent.sent_at, "2026-11-11T10:21:27.056Z");

const current = await store.getOutreachByLead("L1");
assert.equal(current?.id, drafted!.id);
assert.equal(current?.status, "draft");

const n = sql.prepare("SELECT COUNT(*) AS n FROM outreach WHERE lead_id='L1'").get() as { n: number };
assert.equal(n.n, 2);

const listed = await store.listLeads({ boardId: "board_akademo" });
assert.equal(listed.length, 1, "listLeads must not duplicate a lead with two outreach rows");

const lead = (await store.getLead("L1"))!;
const view = {
  ...lead,
  crmStage: "new",
  status: "queued",
  contactMethods: [],
  outreach: current,
} as unknown as LeadWithOutreach;
assert.equal(needsOutreachDraft(view), false, "already has a draft");
assert.equal(canRedraftOutreach(view), true);
assert.equal(view.outreach?.status === "sent", false);
console.log("PASS draftOutreach keeps the sent row and adds a current AKADEMO draft");

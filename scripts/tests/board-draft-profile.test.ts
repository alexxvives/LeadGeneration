/**
 * Regression (12 Nov 2026): Draft remaining used the workspace "active"
 * (client-selected) outreach profile, so AKADEMO-board drafts could be written
 * with the LUMIA pitch. Server-side drafting must use the board-linked profile
 * even when the client sends the wrong offerNotes.
 *
 * Run: npx esbuild scripts/tests/board-draft-profile.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/bdp.mjs && node --experimental-sqlite /tmp/bdp.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { D1Store } from "@/lib/db/d1-store";
import { draftOutreach, type Ctx } from "@/lib/service";
import { profileFromWorkspaceJson } from "@/lib/sender-profile";

const AKADEMO_PITCH =
  "Buenas {company}!<br><br>Me pongo en contacto porque muchas academias online. En AKADEMO trabajamos con centros.";
const LUMIA_PITCH =
  "Os contacto desde LUMIA, somos una empresa coreana respaldada por SAMSUNG. Signed Ona Paradell.";

const storeJson = JSON.stringify({
  activeId: "op_lumia",
  profiles: [
    {
      id: "op_akademo",
      name: "AKADEMO",
      displayName: "akademo",
      company: "AKADEMO",
      title: "",
      website: "",
      signature: "Alexandre Vives<br>CEO de AKADEMO<br>https://akademo-edu.com",
      subjectTemplate: "Propuesta para {company}",
      subjects: { es: "Propuesta para {company}" },
      pitches: { es: AKADEMO_PITCH },
      aiPersonalize: false,
    },
    {
      id: "op_lumia",
      name: "LUMIA",
      displayName: "LUMIA",
      company: "LUMIA",
      title: "",
      website: "",
      signature: "<b>Ona Paradell</b><br>Co-founder &amp; CEO | LUMIA",
      subjectTemplate: "Propuesta para {company}",
      subjects: { en: "Propuesta para {company}" },
      pitches: { en: LUMIA_PITCH },
      aiPersonalize: false,
      staticBody: true,
    },
  ],
});

const linked = profileFromWorkspaceJson(storeJson, "op_akademo");
assert.equal(linked?.id, "op_akademo");
assert.ok(linked?.pitches.es?.includes("AKADEMO"));
const active = profileFromWorkspaceJson(storeJson, null);
assert.equal(active?.id, "op_lumia", "no preferred id → active profile");
const missing = profileFromWorkspaceJson(storeJson, "op_does_not_exist");
assert.equal(missing?.id, "op_lumia", "unknown id falls back to active");
assert.equal(profileFromWorkspaceJson(null, "op_akademo"), null);
console.log("PASS profileFromWorkspaceJson prefers board-linked id");

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

const sql = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  try {
    sql.exec(readFileSync(`migrations/${f}`, "utf8"));
  } catch {
    /* D1-only */
  }
}

const escapedJson = storeJson.replace(/'/g, "''");
sql.exec(
  `INSERT INTO workspaces (id, name, created_at, updated_at, outreach_profiles_json) VALUES ('ws','T','2026-01-01','2026-01-01','${escapedJson}')`,
);
sql.exec(
  "INSERT INTO boards (id, workspace_id, name, outreach_profile_id, created_at, updated_at) VALUES ('board_akademo','ws','AKADEMO','op_akademo','2026-01-01','2026-01-01')",
);
sql.exec(
  "INSERT INTO boards (id, workspace_id, name, outreach_profile_id, created_at, updated_at) VALUES ('board_lumia','ws','LUMIA','op_lumia','2026-01-01','2026-01-01')",
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
const runColsSql = req.includes("workspace_id")
  ? `INSERT INTO runs (${req.join(",")}${req.includes("board_id") ? "" : ",board_id"}) VALUES (${vals.join(",")}${req.includes("board_id") ? "" : ",'board_akademo'"})`
  : `INSERT INTO runs (${req.join(",")},workspace_id${req.includes("board_id") ? "" : ",board_id"}) VALUES (${vals.join(",")},'ws'${req.includes("board_id") ? "" : ",'board_akademo'"})`;
sql.exec(runColsSql);
sql.exec(
  `INSERT INTO leads (id, run_id, company, emails, source_url, status, created_at, workspace_id, board_id, location)
  VALUES ('L1','r1','Callan School','["info@callanschool.info"]','x','new','2026-11-11','ws','board_akademo','Barcelona, Spain')`,
);

const outreach = await draftOutreach(ctx, "L1", {
  signOff: "Ona Paradell",
  offerNotes: LUMIA_PITCH,
  subjectTemplate: "Propuesta para {company}",
  staticBody: true,
  aiPersonalize: false,
  forceLang: "en",
});

assert.ok(outreach, "draft created");
assert.equal(outreach!.subject, "Propuesta para Callan School");
assert.ok(
  outreach!.body.includes("AKADEMO"),
  `expected AKADEMO body, got: ${outreach!.body}`,
);
assert.ok(
  outreach!.body.includes("Alexandre Vives"),
  "AKADEMO signature must be used",
);
assert.ok(
  outreach!.body.includes("Callan School"),
  "company placeholder applied",
);
assert.equal(outreach!.body.includes("LUMIA"), false, "must not use LUMIA pitch");
assert.equal(outreach!.body.includes("SAMSUNG"), false);
assert.equal(outreach!.body.includes("Ona Paradell"), false);
assert.equal(outreach!.status, "draft");
console.log("PASS draftOutreach ignores client LUMIA overrides on AKADEMO board");

// A LUMIA-board lead still gets the LUMIA profile (not cross-contaminated the other way).
sql.exec(
  `INSERT INTO leads (id, run_id, company, emails, source_url, status, created_at, workspace_id, board_id)
  VALUES ('L2','r1','Skin Clinic','["a@x.com"]','x','new','2026-11-11','ws','board_lumia')`,
);
const lumia = await draftOutreach(ctx, "L2", {
  signOff: "Alexandre Vives",
  offerNotes: AKADEMO_PITCH,
  staticBody: true,
  aiPersonalize: false,
});
assert.ok(lumia);
assert.ok(lumia!.body.includes("LUMIA"), `expected LUMIA body, got: ${lumia!.body}`);
assert.ok(lumia!.body.includes("Ona Paradell"));
assert.equal(lumia!.body.includes("AKADEMO"), false);
console.log("PASS draftOutreach uses LUMIA profile on the LUMIA board");

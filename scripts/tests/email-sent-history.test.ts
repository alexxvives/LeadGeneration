/**
 * Send history, Email-status reset when the sent address is removed,
 * New → Contacted on send, and Excel export board scoping.
 * Run: npx esbuild scripts/tests/email-sent-history.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/esh.mjs && node --experimental-sqlite /tmp/esh.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { D1Store } from "@/lib/db/d1-store";
import { updateLeadCrm, type Ctx } from "@/lib/service";
import {
  collapseEmailSentFollowUps,
  hasEmailSentOn,
} from "@/lib/follow-ups";
import {
  crmFieldsAfterEmailSent,
  ensureEmailSentHistory,
  formatEmailSentNote,
  formatSentAddressRemovedNote,
  parseEmailSentDetails,
  shouldResetSentEmailStatus,
} from "@/lib/email-sent-history";
import { exportBoardParam } from "@/lib/export-board";
import { mergeMutationIntoCached } from "@/lib/lead-cache";
import type { FollowUp, Lead, LeadWithOutreach } from "@/lib/types";

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

assert.equal(formatEmailSentNote("a@x.es", "Hola"), "Email sent to a@x.es — Hola");
assert.equal(formatEmailSentNote("a@x.es", "  "), "Email sent to a@x.es");
assert.equal(formatEmailSentNote("", "Hi"), "Email sent — Hi");
assert.deepEqual(parseEmailSentDetails("Email sent to a@x.es — Hola"), {
  to: "a@x.es",
  subject: "Hola",
});
assert.deepEqual(parseEmailSentDetails("Email sent to a@x.es"), {
  to: "a@x.es",
  subject: null,
});
assert.deepEqual(parseEmailSentDetails("Email sent"), { to: null, subject: null });
console.log("PASS format / parse Email sent notes");

assert.equal(
  shouldResetSentEmailStatus({ status: "sent", nextEmails: [], sentTo: "a@x.es" }),
  true,
);
assert.equal(
  shouldResetSentEmailStatus({
    status: "sent",
    nextEmails: ["b@x.es"],
    sentTo: "a@x.es",
  }),
  true,
);
assert.equal(
  shouldResetSentEmailStatus({
    status: "sent",
    nextEmails: ["A@X.es"],
    sentTo: "a@x.es",
  }),
  false,
);
assert.equal(
  shouldResetSentEmailStatus({
    status: "sent",
    nextEmails: ["b@x.es"],
    sentTo: null,
  }),
  false,
);
assert.equal(
  shouldResetSentEmailStatus({
    status: "queued",
    nextEmails: [],
    sentTo: "a@x.es",
  }),
  false,
);
console.log("PASS shouldResetSentEmailStatus");

const bare: FollowUp = {
  id: "fu-bare",
  date: "2026-11-10",
  note: "Email sent",
  done: true,
  kind: "email",
};
const upgraded = ensureEmailSentHistory([bare], {
  leadId: "L1",
  date: "2026-11-10",
  to: "a@x.es",
  subject: "Hola",
  actorName: "Alex",
});
assert.equal(upgraded.filter((f) => f.date === "2026-11-10").length, 1);
assert.equal(upgraded[0]?.note, "Email sent to a@x.es — Hola");
assert.equal(hasEmailSentOn(upgraded, "2026-11-10"), true);
const collapsed = collapseEmailSentFollowUps([
  bare,
  { ...bare, id: "fu-2", note: "Email sent to a@x.es — Hola" },
]);
assert.equal(collapsed.length, 1);
assert.equal(collapsed[0]?.note, "Email sent to a@x.es — Hola");
console.log("PASS ensure + collapse upgrade bare Email sent with to/subject");

const fromNew = crmFieldsAfterEmailSent(
  {
    id: "L1",
    crmStage: "new",
    contactMethods: [],
    followUps: [],
    contactedByName: "Alex",
  },
  {
    toEmail: "a@x.es",
    subject: "Intro",
    sentAtIso: "2026-11-10T12:00:00.000Z",
    actorName: "Alex",
  },
);
assert.equal(fromNew.status, "sent");
assert.equal(fromNew.crmStage, "contacted");
assert.deepEqual(fromNew.contactMethods, ["email"]);
assert.equal(fromNew.followUps[0]?.note, "Email sent to a@x.es — Intro");

const fromLater = crmFieldsAfterEmailSent(
  {
    id: "L1",
    crmStage: "in_conversation",
    contactMethods: ["email", "phone"],
    followUps: fromNew.followUps,
    contactedByName: "Alex",
  },
  {
    toEmail: "a@x.es",
    subject: "Intro",
    sentAtIso: "2026-11-10T12:00:00.000Z",
    actorName: "Alex",
  },
);
assert.equal(fromLater.crmStage, undefined, "must not regress a later stage");
assert.equal(fromLater.contactMethods, undefined);
assert.equal(fromLater.followUps.length, 1);
console.log("PASS send moves New → Contacted and never regresses later stages");

assert.equal(exportBoardParam("board_0d0b6430692147b5af04"), "board_0d0b6430692147b5af04");
assert.equal(exportBoardParam("all"), null);
assert.equal(exportBoardParam(null), null);
assert.equal(exportBoardParam(undefined), null);
console.log("PASS export uses the active board (all boards only when filter is all)");

const cached = {
  id: "L1",
  status: "sent",
  emails: ["a@x.es"],
  followUps: [],
  outreach: {
    id: "O1",
    status: "sent",
    toEmail: "a@x.es",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
} as unknown as LeadWithOutreach;
const server = {
  ...cached,
  status: "new",
  emails: [],
  followUps: [
    {
      id: "fu-rm",
      date: "2026-11-10",
      note: formatSentAddressRemovedNote("a@x.es"),
      done: true,
      kind: "note",
    },
  ],
} as unknown as Lead;
const merged = mergeMutationIntoCached(cached, server, { emails: [] }, 10);
assert.equal(merged.status, "new", "client cache must adopt the reset Email status");
assert.equal(merged.emails.length, 0);
assert.match(merged.followUps[0]?.note ?? "", /Sent address removed/);
console.log("PASS client cache adopts reset status after an email edit");

const sql = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((m) => m.endsWith(".sql")).sort()) {
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
  "INSERT INTO boards (id, workspace_id, name, created_at, updated_at) VALUES ('b1','ws','LUMIA','2026-01-01','2026-01-01')",
);
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
sql.exec(
  `INSERT INTO leads (id, run_id, company, emails, source_url, status, crm_stage, created_at, workspace_id, board_id, version)
   VALUES ('L1','r1','Clinimec','["hola@clinimec.es","info@clinimec.es"]','x','sent','new','2026-10-04','ws','b1',1)`,
);
sql.exec(
  `INSERT INTO outreach (id, lead_id, run_id, to_email, subject, body, status, sent_at, created_at, updated_at, workspace_id)
   VALUES ('O1','L1','r1','hola@clinimec.es','Intro Clinimec','b','sent','2026-10-20T10:00:00.000Z','2026-10-11T00:00:00.000Z','2026-10-20T10:00:00.000Z','ws')`,
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

const keepOther = await updateLeadCrm(ctx, "L1", {
  emails: ["info@clinimec.es"],
});
assert.ok(keepOther);
assert.equal(keepOther.status, "new", "removing the sent-to address resets Email status");
assert.deepEqual(keepOther.emails, ["info@clinimec.es"]);
assert.equal(
  keepOther.followUps.some((f) => /Sent address removed: hola@clinimec.es/i.test(f.note)),
  true,
);
const outreachKept = sql
  .prepare("SELECT to_email, status FROM outreach WHERE id='O1'")
  .get() as { to_email: string; status: string };
assert.equal(outreachKept.to_email, "hola@clinimec.es", "sent outreach To is audit trail");
assert.equal(outreachKept.status, "sent");
console.log("PASS removing the sent-to address resets Email status and keeps it in history");

// Re-set sent + both emails, then remove only the other address — status stays sent.
sql.exec(
  `UPDATE leads SET emails='["hola@clinimec.es","info@clinimec.es"]', status='sent', version=version+1,
          follow_ups='[]' WHERE id='L1'`,
);
const keepSent = await updateLeadCrm(ctx, "L1", {
  emails: ["hola@clinimec.es"],
});
assert.equal(keepSent?.status, "sent", "removing a different email must not reset Sent");
console.log("PASS removing a non-sent email leaves Email status Sent");

sql.exec(
  `UPDATE leads SET emails='["hola@clinimec.es"]', status='sent', version=version+1, follow_ups='[]' WHERE id='L1'`,
);
const cleared = await updateLeadCrm(ctx, "L1", { emails: [] });
assert.equal(cleared?.status, "new");
assert.deepEqual(cleared?.emails, []);
assert.equal(
  cleared?.followUps.some((f) => /Sent address removed: hola@clinimec.es/i.test(f.note)),
  true,
);
const stillSent = sql
  .prepare("SELECT to_email, status FROM outreach WHERE id='O1'")
  .get() as { to_email: string; status: string };
assert.equal(stillSent.to_email, "hola@clinimec.es");
assert.equal(stillSent.status, "sent");
console.log("PASS clearing the email field resets Email status and keeps the sent address in history");

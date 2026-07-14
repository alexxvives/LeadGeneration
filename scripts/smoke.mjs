// Headless smoke test of the core Lodestar flow against a running dev server.
// Usage: start `npm run dev` in one terminal, then `npm run smoke` in another.
// Exercises: create run → draft → approve → send, plus key guardrails.

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.error(`  \u2717 ${name} ${detail}`);
  }
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  console.log("1. Create + run a search");
  const run = await json("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      niche: "smoke-test roofers",
      location: "Denver, CO",
      offerNotes: "We build lead-capture landing pages.",
    }),
  });
  check("run created (201)", run.status === 201, `got ${run.status}`);
  check("run completed", run.body.run?.status === "complete");
  check("leads discovered", (run.body.run?.leadCount ?? 0) > 0);

  console.log("2. Fetch the board");
  const board = await json("/api/board");
  check("board returns leads", board.body.leads?.length > 0);
  check("capabilities present", typeof board.body.capabilities?.canSendEmail === "boolean");

  const lead = board.body.leads.find((l) => l.emails.length > 0) || board.body.leads[0];
  check("found a lead", !!lead);

  console.log("3. Draft outreach");
  const draft = await json("/api/outreach", {
    method: "POST",
    body: JSON.stringify({ leadId: lead.id }),
  });
  check("draft created", draft.status === 201 && draft.body.outreach?.status === "draft");
  const outreachId = draft.body.outreach.id;

  console.log("4. Guardrail: cannot send before approval");
  const early = await json("/api/send", {
    method: "POST",
    body: JSON.stringify({ outreachId }),
  });
  check("send blocked pre-approval (409)", early.status === 409, `got ${early.status}`);

  console.log("5. Approve");
  const approve = await json(`/api/outreach/${outreachId}`, {
    method: "PATCH",
    body: JSON.stringify({ decision: "approved" }),
  });
  check("approved", approve.body.outreach?.status === "approved");

  console.log("6. Send approved");
  const send = await json("/api/send", {
    method: "POST",
    body: JSON.stringify({ outreachId }),
  });
  check("send ok", send.body.ok === true, JSON.stringify(send.body));

  console.log("7. Guardrail: contact-form automation off by default");
  const cf = await json("/api/contact-form", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com", message: "hi" }),
  });
  check("contact-form disabled (403)", cf.status === 403, `got ${cf.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err.message);
  console.error("Is the dev server running? Start it with `npm run dev`.");
  process.exit(1);
});

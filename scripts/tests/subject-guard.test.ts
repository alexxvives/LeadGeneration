/**
 * Outreach subject / stale-send guards.
 *
 * Run: npx esbuild scripts/tests/subject-guard.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/subject-guard.test.mjs && node /tmp/subject-guard.test.mjs
 */
import assert from "node:assert/strict";
import {
  AMBIGUOUS_SEND_ERROR,
  STALE_SENDING_MS,
  isAmbiguousProviderSent,
  isReservedStageLabel,
  isStaleSending,
  outreachSubjectIssue,
} from "@/lib/outreach/subject-guard";
import { applySubjectTemplate } from "@/lib/outreach/draft";
import type { Lead } from "@/lib/types";

assert.equal(outreachSubjectIssue("Propuesta para Farmacia Encants Sagrada Familia"), null);
assert.equal(outreachSubjectIssue("Propuesta para Farmacia FM Isabel Fernández Moral"), null);
assert.equal(outreachSubjectIssue("Propuesta para Tu farmacia en Zaragoza. Contacto Contacto"), null);

assert.match(
  outreachSubjectIssue("Propuesta para To contact") ?? "",
  /queue or stage label/i,
);
assert.match(outreachSubjectIssue("Propuesta para {company}") ?? "", /unfilled placeholder/i);
assert.match(outreachSubjectIssue("Propuesta") ?? "", /missing the company name/i);
assert.match(outreachSubjectIssue("Propuesta para") ?? "", /missing the company name/i);
assert.match(outreachSubjectIssue("   ") ?? "", /Add a subject/i);
assert.match(outreachSubjectIssue("To contact") ?? "", /queue or stage label/i);
assert.match(outreachSubjectIssue("Propuesta para Contact Draft") ?? "", /queue or stage label/i);

assert.equal(isReservedStageLabel("To contact"), true);
assert.equal(isReservedStageLabel("to contact"), true);
assert.equal(isReservedStageLabel("Farmacia Encants Sagrada Familia"), false);
assert.equal(isReservedStageLabel("Contacto Contacto"), false);

assert.equal(isAmbiguousProviderSent({ status: "sending", deliveryStatus: "sent", sentAt: null }), true);
assert.equal(isAmbiguousProviderSent({ status: "sending", deliveryStatus: "unknown", sentAt: null }), false);
assert.equal(isAmbiguousProviderSent({ status: "sent", deliveryStatus: "sent", sentAt: "2026-11-21T07:57:48.361Z" }), false);
assert.ok(AMBIGUOUS_SEND_ERROR.includes("will not send"));

const now = Date.parse("2026-11-21T09:00:00.000Z");
assert.equal(
  isStaleSending({ status: "sending", updatedAt: "2026-11-12T08:21:22.412Z" }, now),
  true,
);
assert.equal(
  isStaleSending({ status: "sending", updatedAt: "2026-11-21T08:59:00.000Z" }, now),
  false,
);
assert.equal(
  isStaleSending({ status: "draft", updatedAt: "2026-11-12T08:21:22.412Z" }, now),
  false,
);
assert.ok(STALE_SENDING_MS === 2 * 60_000);

const stubLead = (company: string): Lead =>
  ({
    id: "lead_test",
    company,
    website: null,
    contactName: null,
    location: null,
    emails: [],
    phones: [],
  }) as Lead;

assert.equal(
  applySubjectTemplate("Propuesta para {company}", stubLead("Farmacia Encants Sagrada Familia")),
  "Propuesta para Farmacia Encants Sagrada Familia",
);
assert.equal(
  applySubjectTemplate("Propuesta para {company}", stubLead("To contact")),
  "Propuesta para",
);
assert.equal(
  outreachSubjectIssue(applySubjectTemplate("Propuesta para {company}", stubLead("To contact"))),
  outreachSubjectIssue("Propuesta para"),
);

console.log("subject-guard.test.ts ok");

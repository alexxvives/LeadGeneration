/**
 * Regression: tree ticks must survive rapid clicks + a concurrent 10s poll.
 * Run: npx esbuild scripts/tests/lead-tree-race.test.ts --bundle --platform=node \
 *        --format=esm --tsconfig=tsconfig.json --outfile=/tmp/ltr.mjs && node /tmp/ltr.mjs
 */
import assert from "node:assert";
import { mergeMutationIntoCached, mergeSlimIntoCached } from "@/lib/lead-cache";
import { mergeLeadPatch } from "@/lib/lead-merge";
import { NO_TRIAL_TREE as NT, toggleTreeStep, treeCursor } from "@/lib/lead-tree";
const PLAN_VARIABLE = NT.planVar, PLAN_FIJO = NT.planFix, NT_PRODUCTS = NT.products;
import type { Lead, LeadWithOutreach } from "@/lib/types";

const base = {
  id: "L1", company: "Acme", crmStage: "new", contactMethods: [], emails: [], phones: [],
  followUps: [], customFields: { __lead_tree: '["c_contact"]' }, leadTree: [], outreach: null,
} as unknown as LeadWithOutreach;

// Client cache: tick A (optimistic, pending).
let cache: LeadWithOutreach = { ...base, leadTree: toggleTreeStep([], NT.contract.id, true), lastWriteAt: 1, writePending: true };
// Poll that started before the tick returns the old server row.
cache = mergeSlimIntoCached(cache, { ...base, leadTree: [] }, { fetchStartedAt: 0 });
assert.deepEqual(cache.leadTree, [NT.contract.id], "poll reverted tick A");
// Tick B before A's PATCH returns.
cache = { ...cache, leadTree: toggleTreeStep(cache.leadTree!, NT.paid.id, true), lastWriteAt: 2, writePending: true };
// A's PATCH response (older write) arrives.
cache = mergeMutationIntoCached(cache, { ...base, leadTree: [NT.contract.id] } as unknown as Lead, { leadTree: [NT.contract.id] }, 1);
assert.deepEqual(cache.leadTree, [NT.contract.id, NT.paid.id], "older PATCH response reverted tick B");
// Another poll mid-flight.
cache = mergeSlimIntoCached(cache, { ...base, leadTree: [NT.contract.id] }, { fetchStartedAt: 1.5 });
assert.deepEqual(cache.leadTree, [NT.contract.id, NT.paid.id], "poll reverted tick B");
// B's response lands; a later poll now agrees.
cache = mergeMutationIntoCached(cache, { ...base, leadTree: [NT.contract.id, NT.paid.id] } as unknown as Lead, { leadTree: [] }, 2);
cache = mergeSlimIntoCached(cache, { ...base, leadTree: [NT.contract.id, NT.paid.id] }, { fetchStartedAt: 3 });
assert.deepEqual(cache.leadTree, [NT.contract.id, NT.paid.id]);
console.log("PASS rapid ticks + concurrent refresh keep ticks");

// Server merge: teammate ticks C while I tick B — both kept; my un-tick removes.
const m = mergeLeadPatch({ leadTree: [NT.contract.id, NT.sepa.id] }, { leadTree: [NT.contract.id] }, { leadTree: [NT.contract.id, NT.paid.id] });
assert.deepEqual(m.apply.leadTree, [NT.contract.id, NT.sepa.id, NT.paid.id]);
const u = mergeLeadPatch({ leadTree: [NT.contract.id, NT.sepa.id] }, { leadTree: [NT.contract.id] }, { leadTree: [] });
assert.deepEqual(u.apply.leadTree, [NT.sepa.id]);
console.log("PASS concurrent tree ticks merge");

// Plan variable / fijo: only one.
let t = toggleTreeStep([], PLAN_VARIABLE.id, true);
t = toggleTreeStep(t, PLAN_FIJO.id, true);
assert.deepEqual(t, [PLAN_FIJO.id]);
console.log("PASS plan variable/fijo exclusive");

// Legacy progress is not read: fresh lead starts at the first step.
assert.equal(treeCursor(base.leadTree!), "Contacto inicial (propuesta de demo + canva general)");
assert.equal(treeCursor(["c_contact","c_demo","c_post_demo","c_interest","c_contract_info","no_trial",PLAN_FIJO.id,NT_PRODUCTS.id,"d_lane_custom"]), "Enviar excel a cliente");
console.log("PASS fresh start + lane cursor");

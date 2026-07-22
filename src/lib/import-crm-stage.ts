import type { ContactMethod, CrmStage } from "@/lib/types";

/**
 * Map spreadsheet Stage / pipeline labels (Attio, HubSpot, HERMES export, …)
 * onto our CrmStage + contact methods.
 */
export function parseImportCrmStage(raw: string | null | undefined): {
  crmStage: CrmStage;
  contactMethods: ContactMethod[];
} | null {
  if (raw == null) return null;
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!s) return null;

  // Explicit CRM keys first.
  if (s === "new" || s === "pending" || s === "todo" || s === "to do") {
    return { crmStage: "new", contactMethods: [] };
  }
  if (
    s === "not interested" ||
    s === "not_interested" ||
    s === "lost" ||
    s === "discarded" ||
    s === "declined" ||
    s === "no"
  ) {
    return { crmStage: "not_interested", contactMethods: [] };
  }
  if (
    s === "closed" ||
    s === "client" ||
    s === "won" ||
    s === "customer" ||
    s === "converted"
  ) {
    return { crmStage: "closed", contactMethods: [] };
  }
  if (
    s === "in conversation" ||
    s === "in_conversation" ||
    s === "in convo" ||
    s === "conversation" ||
    s === "replying" ||
    s === "replied" ||
    s === "closing deal" ||
    s === "closing" ||
    s === "negotiation" ||
    s === "negotiating"
  ) {
    return { crmStage: "in_conversation", contactMethods: [] };
  }

  // Contacted variants — set method when the label implies one.
  if (
    s === "email sent" ||
    s === "emailed" ||
    s === "email" ||
    s === "mailed" ||
    s === "sent" ||
    s === "outreach sent"
  ) {
    return { crmStage: "contacted", contactMethods: ["email"] };
  }
  if (
    s === "called" ||
    s === "call" ||
    s === "phone" ||
    s === "phoned" ||
    s === "rang"
  ) {
    return { crmStage: "contacted", contactMethods: ["phone"] };
  }
  if (
    s === "contact form" ||
    s === "form" ||
    s === "contact_form" ||
    s === "web form"
  ) {
    return { crmStage: "contacted", contactMethods: ["contact_form"] };
  }
  if (
    s === "contacted" ||
    s === "reached" ||
    s === "reached out" ||
    s === "outreach"
  ) {
    return { crmStage: "contacted", contactMethods: [] };
  }

  // Fuzzy contains (localized / longer labels).
  if (/\bnot interested\b|\bdescart|\bno interest\b/.test(s)) {
    return { crmStage: "not_interested", contactMethods: [] };
  }
  if (/\bclient\b|\bwon\b|\bclosed\b|\bcustomer\b/.test(s)) {
    return { crmStage: "closed", contactMethods: [] };
  }
  if (
    /\bin conversation\b|\bclosing deal\b|\bnegoci|\brepli/.test(s)
  ) {
    return { crmStage: "in_conversation", contactMethods: [] };
  }
  if (/\bemail\b|\bemailed\b|\bmailed\b/.test(s)) {
    return { crmStage: "contacted", contactMethods: ["email"] };
  }
  if (/\bcall\b|\bcalled\b|\bphone\b/.test(s)) {
    return { crmStage: "contacted", contactMethods: ["phone"] };
  }
  if (/\bpending\b|\bnew\b/.test(s)) {
    return { crmStage: "new", contactMethods: [] };
  }
  if (/\bcontacted\b/.test(s)) {
    return { crmStage: "contacted", contactMethods: [] };
  }

  return null;
}

/** Prefer the more advanced pipeline stage when merging import → existing. */
const STAGE_RANK: Record<CrmStage, number> = {
  new: 0,
  contacted: 1,
  in_conversation: 2,
  closed: 3,
  not_interested: 3,
};

export function preferCrmStage(
  current: CrmStage,
  incoming: CrmStage,
): CrmStage {
  return STAGE_RANK[incoming] >= STAGE_RANK[current] ? incoming : current;
}

import { normalizeCrmStage, type CrmStage, type Lead, type Outreach } from "@/lib/types";

/**
 * Board hydrate “lanes” so Pipeline + Outreach columns fill in parallel.
 * `draft` / `ready` split CRM New (Contact Draft vs Ready to contact).
 * Other values are Pipeline stages.
 */
export const LEAD_HYDRATE_LANES = [
  "draft",
  "ready",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
] as const;

export type LeadHydrateLane = (typeof LEAD_HYDRATE_LANES)[number];

/** First + later pages: this many rows from each lane. */
export const LEAD_PAGE_PER_LANE = 50;

/** CRM New + a saved draft (or phone-only) → Outreach Ready to Contact. */
export function isOutreachReadyStatus(
  status: Outreach["status"] | undefined,
): boolean {
  return (
    status === "draft" ||
    status === "approved" ||
    status === "sending" ||
    status === "failed"
  );
}

export function leadHydrateLane(
  lead: Pick<Lead, "crmStage" | "emails" | "phones">,
  outreach?: Pick<Outreach, "status" | "toEmail"> | null,
): LeadHydrateLane {
  const stage = normalizeCrmStage(lead.crmStage);
  if (stage !== "new") return stage;
  const email = (outreach?.toEmail ?? lead.emails[0] ?? "").trim();
  const phone = (lead.phones[0] ?? "").trim();
  if (isOutreachReadyStatus(outreach?.status)) return "ready";
  if (!email && phone) return "ready";
  return "draft";
}

/** SQLite predicate (D1). `l` = leads, `o` = outreach. Lane is a closed enum. */
export function hydrateLaneSql(lane: LeadHydrateLane): string {
  const stage = `COALESCE(NULLIF(l.crm_stage, ''), 'new')`;
  const hasEmail = `(TRIM(COALESCE(o.to_email, '')) != '' OR (l.emails IS NOT NULL AND l.emails NOT IN ('', '[]', 'null')))`;
  const hasPhone = `(l.phones IS NOT NULL AND l.phones NOT IN ('', '[]', 'null'))`;
  const isReady = `(o.status IN ('draft', 'approved', 'sending', 'failed') OR (NOT ${hasEmail} AND ${hasPhone}))`;
  if (lane === "draft") return `${stage} = 'new' AND NOT ${isReady}`;
  if (lane === "ready") return `${stage} = 'new' AND ${isReady}`;
  const crm: CrmStage = lane;
  return `${stage} = '${crm}'`;
}

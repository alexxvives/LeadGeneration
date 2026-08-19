import type { ContactMethod, FollowUp, Lead, LeadWithOutreach, Outreach } from "@/lib/types";
import { mergeFollowUpLists } from "@/lib/follow-ups";
import { mergeContactMethods } from "@/lib/contact-methods";

export function droppedFollowUpIdSet(
  lead: Pick<LeadWithOutreach, "droppedFollowUpIds">,
): Set<string> | undefined {
  const ids = lead.droppedFollowUpIds;
  return ids?.length ? new Set(ids) : undefined;
}

export function droppedContactMethodSet(
  lead: Pick<LeadWithOutreach, "droppedContactMethods">,
): Set<ContactMethod> | undefined {
  const methods = lead.droppedContactMethods;
  return methods?.length ? new Set(methods) : undefined;
}

export function rememberDroppedFollowUps(
  prior: LeadWithOutreach | undefined,
  nextFollowUps: FollowUp[] | undefined,
): string[] | undefined {
  const prevDropped = prior?.droppedFollowUpIds ?? [];
  if (!nextFollowUps || !prior?.followUps?.length) {
    return prevDropped.length ? prevDropped : undefined;
  }
  const nextIds = new Set(nextFollowUps.map((f) => f.id));
  const extra = prior.followUps
    .filter((f) => !nextIds.has(f.id))
    .map((f) => f.id);
  if (extra.length === 0) return prevDropped.length ? prevDropped : undefined;
  return [...new Set([...prevDropped, ...extra])];
}

export type SlimMergeOpts = {
  /** `performance.now()` when the GET/poll started. */
  fetchStartedAt?: number;
  /** `performance.now()` stamped on the optimistic write that produced `incoming`. */
  writeAt?: number;
};

/**
 * True when `incoming` was fetched before the latest local write, or while a
 * PATCH is still in flight (poll started *after* the click, returned before save).
 */
export function isStaleSnapshot(
  prev: Pick<LeadWithOutreach, "lastWriteAt" | "writePending">,
  opts?: SlimMergeOpts,
): boolean {
  const local = prev.lastWriteAt;
  if (opts?.writeAt != null) {
    // Older PATCH response vs a newer optimistic write.
    return local != null && local > opts.writeAt;
  }
  if (prev.writePending) return true;
  if (local == null) return false;
  if (opts?.fetchStartedAt != null && local > opts.fetchStartedAt) return true;
  return false;
}

function mergeOutreach(
  prev: Outreach | null,
  incoming: Outreach | null,
  stale: boolean,
  incomingSlim: boolean,
): Outreach | null {
  if (!incoming && !prev) return null;
  if (!incoming) return prev;
  if (!prev) return incoming;
  if (stale) {
    const prevNewer = prev.updatedAt >= incoming.updatedAt;
    const newer = prevNewer ? prev : incoming;
    const older = prevNewer ? incoming : prev;
    return {
      ...newer,
      status: prev.status,
      toEmail: prev.toEmail || incoming.toEmail,
      body: prev.body || incoming.body || older.body,
      subject: prev.subject || incoming.subject || older.subject,
    };
  }
  if (incomingSlim) {
    return {
      ...incoming,
      body: prev.body || incoming.body,
      subject: prev.subject || incoming.subject,
    };
  }
  const incomingNewer = incoming.updatedAt >= prev.updatedAt;
  const newer = incomingNewer ? incoming : prev;
  const older = incomingNewer ? prev : incoming;
  return {
    ...newer,
    body: newer.body || older.body,
    subject: newer.subject || older.subject,
  };
}

function pendingAfterMerge(
  prev: LeadWithOutreach,
  opts: SlimMergeOpts | undefined,
  stale: boolean,
): boolean | undefined {
  if (opts?.writeAt != null) {
    return (prev.lastWriteAt ?? 0) > opts.writeAt ? true : undefined;
  }
  if (stale) return prev.writePending;
  return undefined;
}

/**
 * Merge a slim board-list / GET / PATCH row into a cached lead.
 * Never assigns `incoming` wholesale — journal, methods, and other user
 * fields stay when a local write is newer than the snapshot.
 */
export function mergeSlimIntoCached(
  prev: LeadWithOutreach,
  incoming: LeadWithOutreach,
  opts?: SlimMergeOpts,
): LeadWithOutreach {
  const stale = isStaleSnapshot(prev, opts);
  const incomingSlim = incoming.detailLoaded === false;

  const followUps = mergeFollowUpLists(
    prev.followUps ?? [],
    incoming.followUps ?? [],
    droppedFollowUpIdSet(prev),
  );
  const contactMethods = mergeContactMethods(
    prev.contactMethods ?? [],
    incoming.contactMethods ?? [],
    droppedContactMethodSet(prev),
  );

  // Slim rows include emails/phones (only about/notes/body are nulled). Empty
  // is authoritative when the snapshot is not stale (bounce strip).
  const emails = stale ? prev.emails : (incoming.emails ?? prev.emails);
  const phones = stale ? prev.phones : (incoming.phones ?? prev.phones);

  const crmStage = stale ? prev.crmStage : (incoming.crmStage ?? prev.crmStage);
  const company = stale ? prev.company : incoming.company;
  const website = stale ? prev.website : incoming.website;
  const location = stale ? prev.location : incoming.location;
  const companyType = stale ? prev.companyType : incoming.companyType;
  const customFields = stale
    ? prev.customFields
    : (incoming.customFields ?? prev.customFields);
  const status = stale ? prev.status : incoming.status;
  const contactedByName = stale
    ? (prev.contactedByName ?? incoming.contactedByName)
    : (incoming.contactedByName ?? prev.contactedByName);
  const contactedByUserId = stale
    ? (prev.contactedByUserId ?? incoming.contactedByUserId)
    : (incoming.contactedByUserId ?? prev.contactedByUserId);

  const aboutBlurb = stale
    ? prev.aboutBlurb || incoming.aboutBlurb
    : incomingSlim
      ? incoming.aboutBlurb || prev.aboutBlurb
      : incoming.aboutBlurb;
  const notes = stale
    ? (prev.notes ?? incoming.notes)
    : incomingSlim
      ? (incoming.notes ?? prev.notes)
      : incoming.notes;

  const writePending = pendingAfterMerge(prev, opts, stale);

  return {
    ...incoming,
    crmStage,
    contactMethods,
    emails,
    phones,
    company,
    website,
    location,
    companyType,
    customFields,
    status,
    contactedByName,
    contactedByUserId,
    aboutBlurb,
    notes,
    followUps,
    droppedFollowUpIds: prev.droppedFollowUpIds,
    droppedContactMethods: prev.droppedContactMethods,
    lastWriteAt: prev.lastWriteAt,
    writePending,
    outreach: mergeOutreach(
      prev.outreach,
      incoming.outreach,
      stale,
      incomingSlim,
    ),
    detailLoaded:
      prev.detailLoaded === true || incoming.detailLoaded === true
        ? true
        : incoming.detailLoaded,
  };
}

/**
 * Apply a PATCH response without copying unpatched fields from a stale
 * full-lead snapshot (heal followUps must not clobber an in-flight Phone chip).
 */
export function mergeMutationIntoCached(
  prev: LeadWithOutreach,
  serverLead: Lead,
  patch: Record<string, unknown>,
  writeAt?: number,
): LeadWithOutreach {
  const incoming: LeadWithOutreach = {
    ...prev,
    outreach: prev.outreach,
    detailLoaded: true,
  };
  for (const key of Object.keys(patch)) {
    if (key in serverLead) {
      (incoming as unknown as Record<string, unknown>)[key] =
        (serverLead as unknown as Record<string, unknown>)[key];
    }
  }
  incoming.contactedByName = serverLead.contactedByName;
  incoming.contactedByUserId = serverLead.contactedByUserId;
  incoming.fitScore = serverLead.fitScore;
  incoming.fitReasons = serverLead.fitReasons;
  if (patch.contactMethods !== undefined && patch.crmStage === undefined) {
    incoming.crmStage = serverLead.crmStage;
  }
  if (serverLead.followUps) {
    incoming.followUps = serverLead.followUps;
  }
  return mergeSlimIntoCached(prev, incoming, { writeAt });
}

import type { FollowUp, LeadWithOutreach, Outreach } from "@/lib/types";
import { mergeFollowUpLists } from "@/lib/follow-ups";

export function droppedFollowUpIdSet(
  lead: Pick<LeadWithOutreach, "droppedFollowUpIds">,
): Set<string> | undefined {
  const ids = lead.droppedFollowUpIds;
  return ids?.length ? new Set(ids) : undefined;
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

/** True when `incoming` was fetched or saved before the latest local write. */
export function isStaleSnapshot(
  prev: Pick<LeadWithOutreach, "lastWriteAt">,
  opts?: SlimMergeOpts,
): boolean {
  const local = prev.lastWriteAt;
  if (local == null) return false;
  if (opts?.fetchStartedAt != null && local > opts.fetchStartedAt) return true;
  if (opts?.writeAt != null && local > opts.writeAt) return true;
  return false;
}

/**
 * Prefer a cached list over a stale/slim snapshot.
 * Empty incoming is a wipe on slim rows (`[]` is truthy for `??`) — keep
 * cached extras unless this row had a local write (user cleared the list).
 */
export function pickUserList<T>(
  cached: T[],
  incoming: T[],
  opts: { stale: boolean; hadLocalWrite: boolean },
): T[] {
  if (opts.stale) return cached;
  if (incoming.length > 0) return incoming;
  if (!opts.hadLocalWrite && cached.length > 0) return cached;
  return incoming;
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
    return {
      ...incoming,
      status: prev.status,
      toEmail: prev.toEmail || incoming.toEmail,
      body: prev.body || incoming.body,
      subject: prev.subject || incoming.subject,
    };
  }
  if (incomingSlim) {
    return {
      ...incoming,
      body: prev.body || incoming.body,
      subject: prev.subject || incoming.subject,
    };
  }
  return {
    ...incoming,
    body: incoming.body || prev.body,
    subject: incoming.subject || prev.subject,
  };
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
  const hadLocalWrite = prev.lastWriteAt != null;
  const incomingSlim = incoming.detailLoaded === false;
  const listOpts = { stale, hadLocalWrite };

  const dropped = droppedFollowUpIdSet(prev);
  const followUps = mergeFollowUpLists(
    prev.followUps ?? [],
    incoming.followUps ?? [],
    dropped,
  );

  const contactMethods = pickUserList(
    prev.contactMethods ?? [],
    incoming.contactMethods ?? [],
    listOpts,
  );
  const emails = pickUserList(prev.emails ?? [], incoming.emails ?? [], listOpts);
  const phones = pickUserList(prev.phones ?? [], incoming.phones ?? [], listOpts);

  const crmStage = stale ? prev.crmStage : (incoming.crmStage ?? prev.crmStage);
  const company = stale ? prev.company : incoming.company;
  const website = stale ? prev.website : incoming.website;
  const location = stale ? prev.location : incoming.location;
  const companyType = stale ? prev.companyType : incoming.companyType;
  const customFields = stale ? prev.customFields : incoming.customFields;
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
    lastWriteAt: prev.lastWriteAt,
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

import type { CrmStage, FollowUp, Lead, LeadStatus } from "@/lib/types";
import {
  collapseEmailSentFollowUps,
  emailSentFollowUpId,
  isEmailSentNote,
  withFollowUpAuthor,
} from "@/lib/follow-ups";

const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/** Automatic journal line written on a successful send. */
export function formatEmailSentNote(
  to: string,
  subject?: string | null,
): string {
  const addr = to.trim();
  const sub = (subject ?? "").replace(/\s+/g, " ").trim();
  if (!addr) return sub ? `Email sent — ${sub}` : "Email sent";
  return sub ? `Email sent to ${addr} — ${sub}` : `Email sent to ${addr}`;
}

export function parseEmailSentDetails(note: string): {
  to: string | null;
  subject: string | null;
} {
  const t = note.replace(/\s+/g, " ").trim();
  const m = t.match(
    /^email sent(?:\s+to\s+(\S+?))?(?:\s+[—–-]\s+(.*))?$/i,
  );
  if (!m) return { to: null, subject: null };
  return {
    to: m[1]?.trim() || null,
    subject: m[2]?.trim() || null,
  };
}

export function formatSentAddressRemovedNote(to: string): string {
  return `Sent address removed: ${to.trim()}. Email status reset to New.`;
}

export function hasSentAddressRemovedNote(
  followUps: FollowUp[],
  to: string,
): boolean {
  const needle = normEmail(to);
  if (!needle) return false;
  return followUps.some((f) => {
    const m = f.note.trim().match(/^sent address removed:\s*(\S+?)(?:\.|$)/i);
    return !!m && normEmail(m[1]) === needle;
  });
}

/**
 * True when Email status is Sent and the address that was sent to is gone
 * (field cleared, or that address replaced/removed).
 */
export function shouldResetSentEmailStatus(opts: {
  status: LeadStatus | string;
  nextEmails: string[];
  sentTo?: string | null;
}): boolean {
  if (opts.status !== "sent") return false;
  const next = opts.nextEmails.map((e) => e.trim()).filter(Boolean);
  if (next.length === 0) return true;
  const sentTo = normEmail(opts.sentTo);
  if (!sentTo) return false;
  return !next.some((e) => normEmail(e) === sentTo);
}

/** Prefer a journal line that already records the recipient over a bare one. */
export function ensureEmailSentHistory(
  followUps: FollowUp[],
  opts: {
    leadId: string;
    date: string;
    to: string;
    subject?: string | null;
    actorName?: string | null;
  },
): FollowUp[] {
  const desired = formatEmailSentNote(opts.to, opts.subject);
  const existing = [...followUps];
  const idx = existing.findIndex((f) => {
    if (f.date !== opts.date) return false;
    return isEmailSentNote(f.note) || (!f.note.trim() && f.kind === "email");
  });
  if (idx >= 0) {
    const cur = existing[idx]!;
    const parsed = parseEmailSentDetails(cur.note);
    const haveTo = normEmail(parsed.to) === normEmail(opts.to) && !!opts.to.trim();
    if (haveTo && (!opts.subject?.trim() || parsed.subject)) {
      return collapseEmailSentFollowUps(existing, opts.actorName);
    }
    existing[idx] = withFollowUpAuthor(
      { ...cur, note: desired, kind: "email", done: true },
      opts.actorName,
    );
    return collapseEmailSentFollowUps(existing, opts.actorName);
  }
  return collapseEmailSentFollowUps(
    [
      withFollowUpAuthor(
        {
          id: emailSentFollowUpId(opts.leadId, opts.date),
          date: opts.date,
          note: desired,
          done: true,
          kind: "email",
        },
        opts.actorName,
      ),
      ...existing,
    ],
    opts.actorName,
  );
}

/**
 * CRM fields to apply after a successful send: Email status Sent, New →
 * Contacted (never regress a later stage), and a journal line with To + subject.
 */
export function crmFieldsAfterEmailSent(
  lead: Pick<
    Lead,
    "id" | "crmStage" | "contactMethods" | "followUps" | "contactedByName"
  >,
  opts: {
    toEmail: string;
    subject?: string | null;
    sentAtIso: string;
    actorName?: string | null;
  },
): {
  status: LeadStatus;
  crmStage?: CrmStage;
  contactMethods?: Lead["contactMethods"];
  followUps: FollowUp[];
} {
  const patch: {
    status: LeadStatus;
    crmStage?: CrmStage;
    contactMethods?: Lead["contactMethods"];
    followUps: FollowUp[];
  } = {
    status: "sent",
    followUps: ensureEmailSentHistory(lead.followUps ?? [], {
      leadId: lead.id,
      date: opts.sentAtIso.slice(0, 10),
      to: opts.toEmail,
      subject: opts.subject,
      actorName: opts.actorName ?? lead.contactedByName,
    }),
  };
  if (lead.crmStage === "new") patch.crmStage = "contacted";
  if (!lead.contactMethods.includes("email")) {
    patch.contactMethods = [...lead.contactMethods, "email"];
  }
  return patch;
}

/** Recipient recorded on a sent outreach, else parsed from an "Email sent" line. */
export function sentAddressFrom(
  outreach: { status?: string; sentAt?: string | null; toEmail?: string | null } | null | undefined,
  followUps: FollowUp[] | undefined,
): string | null {
  const fromOutreach =
    outreach && (outreach.status === "sent" || outreach.sentAt)
      ? outreach.toEmail?.trim() || null
      : null;
  if (fromOutreach) return fromOutreach;
  for (const f of followUps ?? []) {
    const to = parseEmailSentDetails(f.note).to;
    if (to) return to;
  }
  return null;
}

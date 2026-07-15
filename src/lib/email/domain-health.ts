/**
 * Resend domain health for the Easy send path.
 *
 * Uses the workspace (or platform) Resend key to list domains and return the
 * DNS rows Resend expects. Never throws for missing keys — demo mode gets a
 * graceful empty payload so Settings still works with zero keys.
 */

export type DnsRecordStatus = "verified" | "pending" | "failed" | "unknown";

export interface DomainDnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status: DnsRecordStatus;
}

export interface DomainHealthResult {
  ok: boolean;
  mode: "live" | "demo";
  domain: string | null;
  domainStatus: string | null;
  records: DomainDnsRecord[];
  /** True when SPF TXT + DKIM look verified (Resend status). */
  ready: boolean;
  message?: string;
  docsUrl: string;
}

type ResendDomainListItem = { id: string; name: string; status: string };
type ResendDomainDetail = {
  id: string;
  name: string;
  status: string;
  records?: Array<{
    record?: string;
    name?: string;
    type?: string;
    value?: string;
    ttl?: string;
    priority?: number;
    status?: string;
  }>;
};

function mapStatus(raw?: string): DnsRecordStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "verified" || s === "success") return "verified";
  if (s === "failed" || s === "temporary_failure") return "failed";
  if (s === "pending" || s === "not_started" || s === "processing") return "pending";
  return "unknown";
}

function domainFromEmail(fromEmail: string | null | undefined): string | null {
  if (!fromEmail) return null;
  const at = fromEmail.lastIndexOf("@");
  if (at < 0) return null;
  const host = fromEmail.slice(at + 1).trim().toLowerCase();
  return host || null;
}

function normalizeRecordName(name: string, domain: string): string {
  const n = name.trim();
  if (!n || n === "@") return domain;
  if (n.endsWith(`.${domain}`) || n === domain) return n;
  return `${n}.${domain}`;
}

export async function fetchResendDomainHealth(opts: {
  apiKey: string | null | undefined;
  fromEmail: string | null | undefined;
}): Promise<DomainHealthResult> {
  const docsUrl = "https://resend.com/docs/dashboard/domains/introduction";
  const domain = domainFromEmail(opts.fromEmail);
  const key = opts.apiKey?.trim();

  if (!key) {
    return {
      ok: true,
      mode: "demo",
      domain,
      domainStatus: null,
      records: [],
      ready: false,
      message:
        "Add your Resend API key above to load live SPF/DKIM rows. Until then, sends stay simulated.",
      docsUrl,
    };
  }

  if (!domain) {
    return {
      ok: true,
      mode: "live",
      domain: null,
      domainStatus: null,
      records: [],
      ready: false,
      message: "Set a From email so we know which domain to check.",
      docsUrl,
    };
  }

  try {
    const listRes = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!listRes.ok) {
      const body = await listRes.text();
      return {
        ok: false,
        mode: "live",
        domain,
        domainStatus: null,
        records: [],
        ready: false,
        message: `Resend domains list failed (${listRes.status}): ${body.slice(0, 160)}`,
        docsUrl,
      };
    }

    const listJson = (await listRes.json()) as { data?: ResendDomainListItem[] };
    const domains = listJson.data ?? [];
    const match =
      domains.find((d) => d.name.toLowerCase() === domain) ??
      domains.find((d) => domain.endsWith(`.${d.name.toLowerCase()}`));

    if (!match) {
      return {
        ok: true,
        mode: "live",
        domain,
        domainStatus: null,
        records: [],
        ready: false,
        message: `No Resend domain named “${domain}”. Add it in Resend → Domains, then poll again.`,
        docsUrl: "https://resend.com/domains",
      };
    }

    const detailRes = await fetch(`https://api.resend.com/domains/${match.id}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!detailRes.ok) {
      const body = await detailRes.text();
      return {
        ok: false,
        mode: "live",
        domain,
        domainStatus: match.status,
        records: [],
        ready: false,
        message: `Resend domain get failed (${detailRes.status}): ${body.slice(0, 160)}`,
        docsUrl,
      };
    }

    const detail = (await detailRes.json()) as ResendDomainDetail;
    const records: DomainDnsRecord[] = (detail.records ?? []).map((r) => ({
      record: r.record ?? "DNS",
      name: normalizeRecordName(r.name ?? "", detail.name),
      type: (r.type ?? "TXT").toUpperCase(),
      value: r.value ?? "",
      ttl: r.ttl,
      priority: r.priority,
      status: mapStatus(r.status),
    }));

    // Soft DMARC hint — Resend may not return DMARC; we still show a recommended row.
    const hasDmarc = records.some(
      (r) =>
        r.name.toLowerCase().startsWith("_dmarc") ||
        r.record.toUpperCase() === "DMARC",
    );
    if (!hasDmarc) {
      records.push({
        record: "DMARC",
        name: `_dmarc.${detail.name}`,
        type: "TXT",
        value: `"v=DMARC1; p=none; rua=mailto:dmarc@${detail.name}"`,
        status: "unknown",
      });
    }

    const spfOk = records.some(
      (r) => r.record.toUpperCase() === "SPF" && r.status === "verified",
    );
    const dkimOk = records.some(
      (r) => r.record.toUpperCase() === "DKIM" && r.status === "verified",
    );
    const domainVerified = mapStatus(detail.status) === "verified";

    return {
      ok: true,
      mode: "live",
      domain: detail.name,
      domainStatus: detail.status,
      records,
      ready: domainVerified || (spfOk && dkimOk),
      docsUrl,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "live",
      domain,
      domainStatus: null,
      records: [],
      ready: false,
      message: err instanceof Error ? err.message : String(err),
      docsUrl,
    };
  }
}

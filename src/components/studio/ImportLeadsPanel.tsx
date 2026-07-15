"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/ui";
import type { ImportLeadRow } from "@/lib/types";
import { normalizeWebsiteUrl } from "@/lib/website";

/** Normalize header cells for fuzzy column matching. */
function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** Prefer earlier keys when multiple header aliases exist (e.g. Opportunity > Name). */
const COMPANY_PREFER = [
  "opportunity",
  "company",
  "companyname",
  "business",
  "businessname",
  "organization",
  "org",
  "accountname",
  "account",
  "name",
];
const EMAIL_PREFER = ["email", "emails", "emailaddress", "mail", "workemail"];
const WEBSITE_PREFER = [
  "website",
  "url",
  "domain",
  "site",
  "webpage",
  "web",
  "homepage",
];
const PHONE_PREFER = ["phone", "phones", "telephone", "mobile", "cell", "tel"];
const LOCATION_PREFER = [
  "location",
  "city",
  "address",
  "region",
  "state",
  "country",
];
const CONTACT_PREFER = [
  "contact",
  "contactname",
  "fullname",
  "fullname",
  "owner",
  "lead",
];

function pickColPreferred(headers: string[], preferred: string[]): number {
  const norms = headers.map(normHeader);
  for (const key of preferred) {
    const i = norms.indexOf(key);
    if (i >= 0) return i;
  }
  return -1;
}

/** ExcelJS cell values may be hyperlinks, formulas, or rich text — never `[object Object]`. */
function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return cleanCellText(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.hyperlink === "string") {
      return cleanCellText(String(o.text ?? o.hyperlink));
    }
    if ("result" in o && o.result != null) return cellStr(o.result);
    if (typeof o.formula === "string") {
      return cleanCellText(o.formula.replace(/^=+/, ""));
    }
    if (typeof o.sharedFormula === "string" && o.result != null) return cellStr(o.result);
    if (Array.isArray(o.richText)) {
      return cleanCellText(
        (o.richText as { text?: string }[]).map((t) => t.text ?? "").join(""),
      );
    }
    if (typeof o.text === "string") return cleanCellText(o.text);
  }
  const s = String(v);
  return s === "[object Object]" ? "" : cleanCellText(s);
}

function cleanCellText(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("=")) s = s.replace(/^=+/, "").trim();
  return s;
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizePhone(raw: string): string {
  let p = raw.trim();
  if (p.startsWith("=")) p = p.replace(/^=+/, "").trim();
  return p.replace(/[^\d+\s().-]/g, "").replace(/\s+/g, " ").trim();
}

function rowsFromMatrix(matrix: string[][]): ImportLeadRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => cellStr(h));
  const companyI = pickColPreferred(headers, COMPANY_PREFER);
  const emailI = pickColPreferred(headers, EMAIL_PREFER);
  const websiteI = pickColPreferred(headers, WEBSITE_PREFER);
  const phoneI = pickColPreferred(headers, PHONE_PREFER);
  const locationI = pickColPreferred(headers, LOCATION_PREFER);
  const contactI = pickColPreferred(headers, CONTACT_PREFER);

  if (companyI < 0 && emailI < 0) {
    throw new Error(
      "Couldn't find a Company or Email column. Rename a header to Company / Email (or Opportunity, Business, Website, etc.) and try again.",
    );
  }

  const out: ImportLeadRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const company = companyI >= 0 ? cellStr(row[companyI]) : "";
    const emails = emailI >= 0 ? splitList(cellStr(row[emailI])) : [];
    if (!company && emails.length === 0) continue;
    const phones =
      phoneI >= 0
        ? splitList(cellStr(row[phoneI]))
            .map(normalizePhone)
            .filter((p) => p.replace(/\D/g, "").length >= 6)
        : [];
    out.push({
      company,
      emails,
      website: websiteI >= 0 ? normalizeWebsiteUrl(cellStr(row[websiteI]) || null) : null,
      phones,
      // Keep full street addresses from the file (better for outreach than city-only).
      location: locationI >= 0 ? cellStr(row[locationI]) || null : null,
      contactName: contactI >= 0 ? cellStr(row[contactI]) || null : null,
    });
  }
  return out;
}

async function parseFile(file: File): Promise<ImportLeadRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || file.type.includes("csv")) {
    const text = await file.text();
    const delim = name.endsWith(".tsv") || text.indexOf("\t") > text.indexOf(",") ? "\t" : ",";
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const matrix = lines.map((line) => {
      const cells: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQ = !inQ;
          continue;
        }
        if (!inQ && ch === delim) {
          cells.push(cur);
          cur = "";
          continue;
        }
        cur += ch;
      }
      cells.push(cur);
      return cells;
    });
    return rowsFromMatrix(matrix);
  }

  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) {
    throw new Error("Legacy .xls is not supported — save as .xlsx or export CSV.");
  }

  if (name.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const buf = await file.arrayBuffer();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new Error("Spreadsheet has no sheets.");
    const matrix: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const vals: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const raw =
          cell.value != null
            ? cell.value
            : typeof cell.text === "string"
              ? cell.text
              : "";
        vals[colNumber - 1] = cellStr(raw);
      });
      const max = Math.max(vals.length, ...(matrix[0] ? [matrix[0].length] : [0]));
      for (let i = 0; i < max; i++) vals[i] = vals[i] ?? "";
      matrix[rowNumber - 1] = vals;
    });
    return rowsFromMatrix(matrix.filter(Boolean));
  }

  throw new Error("Use a .csv or .xlsx file.");
}

type ImportDest = "append" | "new";

/**
 * Drop-zone / file picker to feed an existing lead list into the pipeline.
 * Flexible headers — we map Company/Email/Website/etc. by aliases.
 */
export function ImportLeadsPanel({
  activeRunId,
  boardLeadCount = 0,
  onImported,
}: {
  /** When set and board has leads, user can append onto that board. */
  activeRunId?: string | null;
  boardLeadCount?: number;
  onImported: (runId: string) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canAppend = !!activeRunId && boardLeadCount > 0;
  const [dest, setDest] = useState<ImportDest>(canAppend ? "append" : "new");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // If board becomes available mid-session, prefer append.
  const effectiveDest: ImportDest = canAppend ? dest : "new";

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const leads = await parseFile(file);
      if (leads.length === 0) {
        throw new Error("No data rows found after the header.");
      }
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads,
          mode: effectiveDest,
          appendToRunId: effectiveDest === "append" ? activeRunId : undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        imported?: number;
        merged?: number;
        skipped?: number;
        run?: { id: string };
      };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const parts = [
        `Added ${data.imported ?? 0} new`,
        data.merged ? `merged ${data.merged} existing` : null,
        data.skipped
          ? effectiveDest === "new"
            ? `skipped ${data.skipped} already in workspace`
            : `skipped ${data.skipped} unchanged`
          : null,
      ].filter(Boolean);
      setMsg(`${parts.join(" · ")}.`);
      if (data.run?.id) await onImported(data.run.id);
      else await onImported(activeRunId ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-6 rounded-xl2 border border-dashed border-white/15 bg-ink-900/30 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-mist-100">Already have a list?</p>
          <p className="mt-1 text-xs leading-relaxed text-mist-500">
            Drop a CSV or Excel file. We auto-detect Opportunity/Company, Email, Website,
            Phone, Address.
          </p>
          {canAppend ? (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-mist-500">
                Where should they go?
              </p>
              <div className="inline-flex rounded-full border border-white/10 bg-ink-900/60 p-1">
                <button
                  type="button"
                  onClick={() => setDest("append")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    effectiveDest === "append"
                      ? "bg-aurora-400 text-ink-950"
                      : "text-mist-300 hover:text-mist-100"
                  }`}
                >
                  Current board
                </button>
                <button
                  type="button"
                  onClick={() => setDest("new")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    effectiveDest === "new"
                      ? "bg-aurora-400 text-ink-950"
                      : "text-mist-300 hover:text-mist-100"
                  }`}
                >
                  New list
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-mist-600">
                {effectiveDest === "append"
                  ? `Adds onto your open board (${boardLeadCount} lead${boardLeadCount === 1 ? "" : "s"}). Matches by email/website update gaps instead of duplicating.`
                  : "Starts a fresh board. Rows already in the workspace are skipped."}
              </p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {busy ? "Importing…" : "Import CSV / Excel"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {msg && <p className="mt-3 text-sm text-aurora-300">{msg}</p>}
      {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
    </div>
  );
}

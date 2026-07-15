"use client";

import { useRef, useState } from "react";
import { ArrowIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import type { ImportLeadRow } from "@/lib/types";

/** Normalize header cells for fuzzy column matching. */
function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const COMPANY_KEYS = new Set([
  "company",
  "companyname",
  "business",
  "businessname",
  "organization",
  "org",
  "name",
  "account",
  "accountname",
]);
const EMAIL_KEYS = new Set(["email", "emails", "emailaddress", "mail", "workemail"]);
const WEBSITE_KEYS = new Set([
  "website",
  "url",
  "domain",
  "site",
  "webpage",
  "web",
  "homepage",
]);
const PHONE_KEYS = new Set(["phone", "phones", "telephone", "mobile", "cell"]);
const LOCATION_KEYS = new Set([
  "location",
  "city",
  "address",
  "region",
  "state",
  "country",
]);
const CONTACT_KEYS = new Set([
  "contact",
  "contactname",
  "fullname",
  "fullname",
  "owner",
  "lead",
]);

function pickCol(headers: string[], keys: Set<string>): number {
  const norms = headers.map(normHeader);
  const i = norms.findIndex((h) => keys.has(h));
  return i;
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function rowsFromMatrix(matrix: string[][]): ImportLeadRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => cellStr(h));
  const companyI = pickCol(headers, COMPANY_KEYS);
  const emailI = pickCol(headers, EMAIL_KEYS);
  const websiteI = pickCol(headers, WEBSITE_KEYS);
  const phoneI = pickCol(headers, PHONE_KEYS);
  const locationI = pickCol(headers, LOCATION_KEYS);
  const contactI = pickCol(headers, CONTACT_KEYS);

  if (companyI < 0 && emailI < 0) {
    throw new Error(
      "Couldn't find a Company or Email column. Rename a header to Company / Email (or Business, Website, etc.) and try again.",
    );
  }

  const out: ImportLeadRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const company = companyI >= 0 ? cellStr(row[companyI]) : "";
    const emails = emailI >= 0 ? splitList(cellStr(row[emailI])) : [];
    if (!company && emails.length === 0) continue;
    out.push({
      company,
      emails,
      website: websiteI >= 0 ? cellStr(row[websiteI]) || null : null,
      phones: phoneI >= 0 ? splitList(cellStr(row[phoneI])) : [],
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
      // Simple CSV split — good enough for typical lead exports.
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
    sheet.eachRow((row, rowNumber) => {
      const vals: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        vals[colNumber - 1] = cellStr(cell.value);
      });
      // Pad to dense array
      const max = Math.max(vals.length, ...(matrix[0] ? [matrix[0].length] : [0]));
      for (let i = 0; i < max; i++) vals[i] = vals[i] ?? "";
      matrix[rowNumber - 1] = vals;
    });
    return rowsFromMatrix(matrix.filter(Boolean));
  }

  throw new Error("Use a .csv or .xlsx file.");
}

/**
 * Drop-zone / file picker to feed an existing lead list into the pipeline.
 * Flexible headers — we map Company/Email/Website/etc. by aliases.
 */
export function ImportLeadsPanel({
  onImported,
}: {
  onImported: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        body: JSON.stringify({ leads }),
      });
      const data = (await res.json()) as {
        error?: string;
        imported?: number;
        skipped?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setMsg(
        `Imported ${data.imported ?? 0} lead${(data.imported ?? 0) === 1 ? "" : "s"}` +
          (data.skipped ? ` · skipped ${data.skipped} duplicates` : "") +
          ".",
      );
      await onImported();
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
            Drop a CSV or Excel file. We auto-detect columns like Company, Email, Website,
            Phone, Location.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {busy ? <Spinner className="h-4 w-4" /> : <ArrowIcon className="h-4 w-4" />}
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

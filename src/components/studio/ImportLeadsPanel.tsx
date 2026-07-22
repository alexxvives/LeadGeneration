"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { ImportLeadRow } from "@/lib/types";
import { parseImportCrmStage } from "@/lib/import-crm-stage";
import { normalizeWebsiteUrl } from "@/lib/website";

/** Normalize header cells for fuzzy column matching (alias fallback). */
function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s_-]+/g, "");
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
const TYPE_PREFER = [
  "companytype",
  "categoria",
  "categoría",
  "categorie",
  "category",
  "type",
  "tipo",
  "tipologia",
  "industry",
  "segment",
  "vertical",
  "businesstype",
  "venue",
];
const STAGE_PREFER = [
  "stage",
  "crmstage",
  "pipelinestage",
  "dealstage",
  "salesstage",
  "pipeline",
  "status",
  "leadstatus",
  "dealstatus",
];

type ColMap = {
  company: number;
  emails: number;
  website: number;
  phones: number;
  location: number;
  contactName: number;
  companyType: number;
  crmStage: number;
};

function pickColPreferred(headers: string[], preferred: string[]): number {
  const norms = headers.map(normHeader);
  for (const key of preferred) {
    const i = norms.indexOf(key);
    if (i >= 0) return i;
  }
  return -1;
}

function aliasColMap(headers: string[]): ColMap {
  return {
    company: pickColPreferred(headers, COMPANY_PREFER),
    emails: pickColPreferred(headers, EMAIL_PREFER),
    website: pickColPreferred(headers, WEBSITE_PREFER),
    phones: pickColPreferred(headers, PHONE_PREFER),
    location: pickColPreferred(headers, LOCATION_PREFER),
    contactName: pickColPreferred(headers, CONTACT_PREFER),
    companyType: pickColPreferred(headers, TYPE_PREFER),
    crmStage: pickColPreferred(headers, STAGE_PREFER),
  };
}

function colFill(matrix: string[][], col: number): number {
  if (col < 0 || matrix.length < 2) return 0;
  let n = 0;
  for (let r = 1; r < matrix.length; r++) {
    if (cellStr(matrix[r]?.[col] ?? "").trim()) n++;
  }
  return n;
}

/**
 * Prefer LLM for odd/localized headers, but never keep a sparse "company"
 * mapping when alias found a denser business column (e.g. Opportunity vs
 * empty Name → would drop most rows).
 */
function reconcileColMap(ai: ColMap, alias: ColMap, matrix: string[][]): ColMap {
  const out = { ...ai };
  const aiFill = colFill(matrix, out.company);
  const aliasFill = colFill(matrix, alias.company);

  // AI put company on the person-name column while Opportunity/Company exists.
  if (
    alias.company >= 0 &&
    out.company === alias.contactName &&
    alias.company !== out.company
  ) {
    const personCol = out.contactName >= 0 ? out.contactName : out.company;
    out.company = alias.company;
    if (personCol !== out.company) out.contactName = personCol;
  } else if (
    alias.company >= 0 &&
    aliasFill > aiFill * 2 &&
    aliasFill >= Math.max(10, aiFill + 50)
  ) {
    // AI company column is mostly empty; alias business column is dense.
    if (out.contactName < 0 && out.company >= 0 && out.company !== alias.company) {
      out.contactName = out.company;
    }
    out.company = alias.company;
  }

  // Fill gaps from alias when AI omitted a field; prefer denser alias cols
  // when AI mapped a sparse/wrong column (e.g. missed Spanish "Categoria").
  const preferDense = (aiCol: number, aliasCol: number): number => {
    if (aliasCol < 0) return aiCol;
    if (aiCol < 0) return aliasCol;
    if (aiCol === aliasCol) return aiCol;
    const a = colFill(matrix, aiCol);
    const b = colFill(matrix, aliasCol);
    if (b > a * 2 && b >= Math.max(10, a + 20)) return aliasCol;
    return aiCol;
  };

  out.emails = preferDense(out.emails, alias.emails);
  out.website = preferDense(out.website, alias.website);
  out.phones = preferDense(out.phones, alias.phones);
  out.location = preferDense(out.location, alias.location);
  out.contactName = preferDense(out.contactName, alias.contactName);
  out.companyType = preferDense(out.companyType, alias.companyType);
  out.crmStage = preferDense(out.crmStage, alias.crmStage);
  if (out.company < 0) out.company = alias.company;

  return out;
}

async function resolveColMap(
  headers: string[],
  matrix: string[][],
): Promise<ColMap> {
  const alias = aliasColMap(headers);
  // Imports are rare vs draft AI — prefer LLM (any language / odd CRM names).
  // Alias list is the demo / zero-key fallback + density safety net.
  try {
    const { mapping } = await api.mapImportColumns(headers);
    if (mapping && (mapping.company != null || mapping.emails != null)) {
      const ai: ColMap = {
        company: mapping.company ?? -1,
        emails: mapping.emails ?? -1,
        website: mapping.website ?? -1,
        phones: mapping.phones ?? -1,
        location: mapping.location ?? -1,
        contactName: mapping.contactName ?? -1,
        companyType: mapping.companyType ?? -1,
        crmStage: mapping.crmStage ?? -1,
      };
      return reconcileColMap(ai, alias, matrix);
    }
  } catch {
    // fall through
  }
  return alias;
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

async function rowsFromMatrix(matrix: string[][]): Promise<ImportLeadRow[]> {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => cellStr(h));
  const cols = await resolveColMap(headers, matrix);

  if (cols.company < 0 && cols.emails < 0) {
    throw new Error(
      "Couldn't map a Company or Email column. Rename a header to Company / Email (or try again with AI available).",
    );
  }

  const out: ImportLeadRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const company = cols.company >= 0 ? cellStr(row[cols.company]) : "";
    const emails = cols.emails >= 0 ? splitList(cellStr(row[cols.emails])) : [];
    if (!company && emails.length === 0) continue;
    const phones =
      cols.phones >= 0
        ? splitList(cellStr(row[cols.phones]))
            .map(normalizePhone)
            .filter((p) => p.replace(/\D/g, "").length >= 6)
        : [];
    const stageParsed =
      cols.crmStage >= 0
        ? parseImportCrmStage(cellStr(row[cols.crmStage]))
        : null;
    out.push({
      company,
      emails,
      website:
        cols.website >= 0
          ? normalizeWebsiteUrl(cellStr(row[cols.website]) || null)
          : null,
      phones,
      location: cols.location >= 0 ? cellStr(row[cols.location]) || null : null,
      contactName:
        cols.contactName >= 0 ? cellStr(row[cols.contactName]) || null : null,
      companyType:
        cols.companyType >= 0 ? cellStr(row[cols.companyType]) || null : null,
      ...(stageParsed
        ? {
            crmStage: stageParsed.crmStage,
            contactMethods: stageParsed.contactMethods,
          }
        : {}),
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

/**
 * Drop-zone / file picker. Destination board is chosen in a parent modal
 * (BoardAssignModal) before upload — see ADR 0014.
 */
export function ImportLeadsPanel({
  onPickFile,
}: {
  onPickFile: (leads: ImportLeadRow[], fileName: string) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const leads = await parseFile(file);
      if (leads.length === 0) {
        throw new Error("No data rows found after the header.");
      }
      await onPickFile(leads, file.name);
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
            Drop a CSV or Excel file. We use AI to map columns (any language), then
            you choose which board they go to.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {busy ? "Reading…" : "Import CSV / Excel"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
    </div>
  );
}

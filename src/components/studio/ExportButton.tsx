"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { ExportIcon } from "@/components/icons";
import { Spinner, crmStageLabel } from "@/components/ui";
import type { CrmStage, LeadStatus } from "@/lib/types";

const STAGE_LABELS: CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
  "discarded",
];

const EMAIL_STATUS_LABELS: LeadStatus[] = [
  "new",
  "queued",
  "approved",
  "sent",
  "rejected",
  "failed",
];

function statusLabel(s: LeadStatus): string {
  const map: Record<LeadStatus, string> = {
    new: "New",
    queued: "Draft ready",
    approved: "Approved",
    sent: "Sent",
    rejected: "Rejected",
    failed: "Failed",
  };
  return map[s] ?? s;
}

/**
 * Export leads as a real Excel Table with conditional formatting rules
 * and data-validation dropdowns for categorical columns (not hardcoded fills).
 */
export function ExportButton() {
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const board = await api.board();
      const rows = board.leads;
      const lastRow = Math.max(rows.length + 1, 2);

      const wb = new ExcelJS.Workbook();
      wb.creator = "Leadify";
      wb.created = new Date();

      const ws = wb.addWorksheet("Leads", {
        views: [{ state: "frozen", ySplit: 1 }],
        properties: { defaultRowHeight: 20 },
      });

      const tableRows = rows.map((l) => {
        const stage = (l.crmStage ?? "new") as CrmStage;
        return [
          l.company,
          l.website ?? "",
          l.location ?? "",
          l.emails.join("; "),
          l.phones.join("; "),
          l.fitScore,
          crmStageLabel(stage),
          statusLabel(l.status),
          l.outreach?.subject ?? "",
          l.sourceUrl,
        ];
      });

      ws.addTable({
        name: "LeadsTable",
        ref: `A1:J${lastRow}`,
        headerRow: true,
        totalsRow: false,
        style: {
          theme: "TableStyleMedium9",
          showRowStripes: true,
        },
        columns: [
          { name: "Company", filterButton: true },
          { name: "Website", filterButton: true },
          { name: "Location", filterButton: true },
          { name: "Emails", filterButton: true },
          { name: "Phones", filterButton: true },
          { name: "Fit Score", filterButton: true },
          { name: "Pipeline Stage", filterButton: true },
          { name: "Email Status", filterButton: true },
          { name: "Subject", filterButton: true },
          { name: "Source URL", filterButton: true },
        ],
        rows: tableRows.length > 0 ? tableRows : [["", "", "", "", "", 0, "", "", "", ""]],
      });

      ws.getColumn(1).width = 28;
      ws.getColumn(2).width = 32;
      ws.getColumn(3).width = 22;
      ws.getColumn(4).width = 36;
      ws.getColumn(5).width = 18;
      ws.getColumn(6).width = 12;
      ws.getColumn(7).width = 18;
      ws.getColumn(8).width = 14;
      ws.getColumn(9).width = 36;
      ws.getColumn(10).width = 40;

      // Fit score — color scale (conditional formatting, not hardcoded cells)
      ws.addConditionalFormatting({
        ref: `F2:F${lastRow}`,
        rules: [
          {
            type: "colorScale",
            priority: 1,
            cfvo: [
              { type: "num", value: 0 },
              { type: "num", value: 55 },
              { type: "num", value: 100 },
            ],
            color: [
              { argb: "FFFB7185" },
              { argb: "FFF7B955" },
              { argb: "FF43E0A8" },
            ],
          },
        ],
      });

      // Pipeline stage — formula rules by label
      const stageColors: Record<string, string> = {
        New: "FFB6C4DC",
        Contacted: "FFF7B955",
        "In Conversation": "FF38BDF8",
        Closed: "FF7FF2C8",
        "Not Interested": "FFFB7185",
        Discarded: "FF5C6B82",
      };
      let priority = 2;
      for (const [label, argb] of Object.entries(stageColors)) {
        ws.addConditionalFormatting({
          ref: `G2:G${lastRow}`,
          rules: [
            {
              type: "expression",
              priority: priority++,
              formulae: [`$G2="${label}"`],
              style: {
                fill: {
                  type: "pattern",
                  pattern: "solid",
                  bgColor: { argb },
                },
              },
            },
          ],
        });
      }

      // Dropdowns for categorical columns (per-cell dataValidation in ExcelJS)
      const stageList = STAGE_LABELS.map(crmStageLabel).join(",");
      const statusList = EMAIL_STATUS_LABELS.map(statusLabel).join(",");
      const validationEnd = Math.max(lastRow, rows.length + 50);
      for (let r = 2; r <= validationEnd; r++) {
        ws.getCell(r, 7).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${stageList}"`],
          showErrorMessage: true,
          errorTitle: "Pipeline Stage",
          error: "Pick a stage from the list.",
        };
        ws.getCell(r, 8).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${statusList}"`],
          showErrorMessage: true,
          errorTitle: "Email Status",
          error: "Pick a status from the list.",
        };
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leadify-leads-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void exportExcel()}
      disabled={exporting}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-mist-300 transition-colors hover:border-white/20 hover:text-mist-100 disabled:opacity-50"
    >
      {exporting ? <Spinner className="h-4 w-4" /> : <ExportIcon className="h-4 w-4" />}
      {exporting ? "Exporting…" : "Export Excel"}
    </button>
  );
}

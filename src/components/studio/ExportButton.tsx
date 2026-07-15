"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { ExportIcon } from "@/components/icons";
import { Spinner, crmStageLabel } from "@/components/ui";
import type { CrmStage } from "@/lib/types";

/** Lodestar ink/aurora palette as ARGB hex for ExcelJS. */
const INK = "FF0A1120";
const AURORA = "FF43E0A8";
const AURORA_DARK = "FF0E9D74";
const MIST = "FFEAF1FB";
const MIST_MUTED = "FFB6C4DC";
const SKY = "FF38BDF8";
const AMBER = "FFF7B955";
const ROSE = "FFFB7185";
const ROW_ALT = "FF131F34";
const WHITE = "FFFFFFFF";

const STAGE_FILL: Record<CrmStage, string> = {
  new: "FF7F92B3",
  contacted: AMBER,
  in_conversation: SKY,
  closed: "FF7FF2C8",
  not_interested: ROSE,
  discarded: "FF5C6B82",
};

const STAGE_FONT: Record<CrmStage, string> = {
  new: WHITE,
  contacted: INK,
  in_conversation: INK,
  closed: INK,
  not_interested: WHITE,
  discarded: WHITE,
};

export function ExportButton() {
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const board = await api.board();
      const rows = board.leads;

      const wb = new ExcelJS.Workbook();
      wb.creator = "Lodestar";
      wb.created = new Date();

      const ws = wb.addWorksheet("Leads", {
        views: [{ state: "frozen", ySplit: 1 }],
        properties: { defaultRowHeight: 22 },
      });

      ws.columns = [
        { header: "Company", key: "company", width: 28 },
        { header: "Website", key: "website", width: 32 },
        { header: "Location", key: "location", width: 22 },
        { header: "Emails", key: "emails", width: 36 },
        { header: "Phones", key: "phones", width: 18 },
        { header: "Fit Score", key: "fitScore", width: 12 },
        { header: "Pipeline Stage", key: "stage", width: 18 },
        { header: "Email Status", key: "emailStatus", width: 14 },
        { header: "Subject", key: "subject", width: 36 },
        { header: "Source URL", key: "sourceUrl", width: 40 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AURORA_DARK } };
        cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = {
          bottom: { style: "thin", color: { argb: AURORA } },
        };
      });

      for (const [i, l] of rows.entries()) {
        const stage = (l.crmStage ?? "new") as CrmStage;
        const row = ws.addRow({
          company: l.company,
          website: l.website ?? "",
          location: l.location ?? "",
          emails: l.emails.join("; "),
          phones: l.phones.join("; "),
          fitScore: l.fitScore,
          stage: crmStageLabel(stage),
          emailStatus: l.status,
          subject: l.outreach?.subject ?? "",
          sourceUrl: l.sourceUrl,
        });

        const alt = i % 2 === 1;
        row.eachCell((cell, colNumber) => {
          cell.font = { name: "Calibri", size: 10, color: { argb: MIST } };
          cell.alignment = { vertical: "middle" };
          if (alt) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
          } else {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
          }
          // Soft grid
          cell.border = {
            bottom: { style: "hair", color: { argb: "FF1E2D45" } },
          };

          // Pipeline stage chip coloring
          if (colNumber === 7) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: STAGE_FILL[stage] },
            };
            cell.font = {
              name: "Calibri",
              size: 10,
              bold: true,
              color: { argb: STAGE_FONT[stage] },
            };
            cell.alignment = { vertical: "middle", horizontal: "center" };
          }

          // Fit score — color by band
          if (colNumber === 6) {
            const score = Number(l.fitScore);
            const tone =
              score >= 75 ? AURORA : score >= 55 ? AMBER : MIST_MUTED;
            cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: tone } };
            cell.alignment = { vertical: "middle", horizontal: "center" };
          }
        });
      }

      // Auto-filter on header
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 10 },
      };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lodestar-leads-${new Date().toISOString().slice(0, 10)}.xlsx`;
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

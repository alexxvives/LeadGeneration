"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { ExportIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";

export function ExportButton() {
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const board = await api.board();
      const rows = board.leads;
      const header = [
        "company", "website", "location", "emails",
        "phones", "fitScore", "status", "subject", "sourceUrl",
      ];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = [
        header.join(","),
        ...rows.map((l) =>
          [
            l.company,
            l.website ?? "",
            l.location ?? "",
            l.emails.join("; "),
            l.phones.join("; "),
            String(l.fitScore),
            l.status,
            l.outreach?.subject ?? "",
            l.sourceUrl,
          ]
            .map((c) => escape(String(c)))
            .join(","),
        ),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lodestar-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void exportCsv()}
      disabled={exporting}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-mist-300 transition-colors hover:border-white/20 hover:text-mist-100 disabled:opacity-50"
    >
      {exporting ? <Spinner className="h-4 w-4" /> : <ExportIcon className="h-4 w-4" />}
      {exporting ? "Exporting…" : "Export CSV"}
    </button>
  );
}

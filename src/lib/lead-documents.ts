/** Closed-lead document rules — shared by service + upload UI. */

export const LEAD_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
};

export const LEAD_DOCUMENT_ACCEPT = Object.keys(EXT_MIME)
  .map((ext) => `.${ext}`)
  .join(",");

export function sanitizeDocumentName(raw: string): string {
  const base = raw.replace(/[/\\]/g, "").split(/[/\\]/).pop()?.trim() || "document";
  return base.slice(0, 180) || "document";
}

export function inferDocumentMime(name: string, provided?: string | null): string {
  const ext = name.split(".").pop()?.trim().toLowerCase() ?? "";
  const fromName = EXT_MIME[ext];
  if (fromName) return fromName;
  const given = provided?.trim().toLowerCase() ?? "";
  if (given && given !== "application/octet-stream") return given;
  return "application/octet-stream";
}

export function isAllowedDocument(name: string, mime: string): boolean {
  const ext = name.split(".").pop()?.trim().toLowerCase() ?? "";
  if (EXT_MIME[ext]) return true;
  return Object.values(EXT_MIME).includes(mime);
}

export function formatDocumentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

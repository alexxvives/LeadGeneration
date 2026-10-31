/** European date display: dd/mm/yyyy (and HH:mm for timestamps). */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Accepts "YYYY-MM-DD", an ISO timestamp or a Date; returns dd/mm/yyyy. */
export function formatDateEu(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** dd/mm/yyyy HH:mm in local time. */
export function formatDateTimeEu(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDateEu(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** dd/mm (no year) for compact chips. */
export function formatDayMonthEu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

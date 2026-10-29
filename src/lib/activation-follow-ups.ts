/**
 * Post-sale follow-ups computed from the software activation date (asked when
 * "Enviar credenciales" is ticked). Stored on the lead as a custom field and
 * mirrored as highlighted (red) calendar tasks with deterministic ids, so
 * re-entering the date updates the same tasks instead of adding new ones.
 */

export const ACTIVATION_FIELD = "__activation_date";

export type FollowUpKey = "w1" | "m1" | "m6" | "y1" | "y2" | "y3";

export const FOLLOW_UP_PLAN: ReadonlyArray<{ key: FollowUpKey; label: string; days?: number; months?: number }> = [
  { key: "w1", label: "Seguimiento semana 1", days: 7 },
  { key: "m1", label: "Seguimiento mes 1", months: 1 },
  { key: "m6", label: "Seguimiento mes 6", months: 6 },
  { key: "y1", label: "Seguimiento año 1", months: 12 },
  { key: "y2", label: "Seguimiento año 2", months: 24 },
  { key: "y3", label: "Seguimiento año 3", months: 36 },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Add calendar months; clamps to the month's last day (31 Jan + 1m = 28/29 Feb). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = total % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, last))).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function followUpDates(activation: string): Record<FollowUpKey, string> {
  const out = {} as Record<FollowUpKey, string>;
  for (const f of FOLLOW_UP_PLAN) {
    out[f.key] = f.days ? addDaysIso(activation, f.days) : addMonthsIso(activation, f.months!);
  }
  return out;
}

/** Stable task id per lead + follow-up: the idempotency key. */
export function followUpTaskId(leadId: string, key: FollowUpKey): string {
  return `task_act_${leadId}_${key}`;
}

/** Tree step ids for follow-ups end in `_f_<key>`. */
export function followUpKeyOfStep(stepId: string): FollowUpKey | null {
  const m = /_f_(w1|m1|m6|y1|y2|y3)$/.exec(stepId);
  return (m?.[1] as FollowUpKey | undefined) ?? null;
}

export function activationDateOf(customFields: Record<string, string> | undefined): string | null {
  const v = customFields?.[ACTIVATION_FIELD];
  return isIsoDate(v) ? v : null;
}

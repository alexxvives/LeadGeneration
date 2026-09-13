"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { todayIsoDate } from "@/lib/follow-ups";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const POPOVER_W = 280;
const POPOVER_H = 320;

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || month < 0 || month > 11 || d < 1 || d > 31) {
    return null;
  }
  return { y, m: month, d };
}

function isoFrom(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function mondayOffset(jsSundayZero: number): number {
  return (jsSundayZero + 6) % 7;
}

function formatField(iso: string): string {
  const p = parseIso(iso);
  if (!p) return iso || "Pick a date";
  return new Date(p.y, p.m, p.d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function monthTitle(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Branded date field — glass trigger + mini month popover (portaled so
 * drawer overflow does not clip it). Replaces native `type="date"`.
 * Popover is `z-[1200]`: above Lead/Contact drawers (`z-[1100]`), below
 * toasts (`z-[2000]`).
 */
export function DatePicker({
  value,
  onChange,
  disabled = false,
  label,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const parsed = parseIso(value);
  const today = todayIsoDate();
  const [cursor, setCursor] = useState(() =>
    parsed
      ? { y: parsed.y, m: parsed.m }
      : (() => {
          const n = new Date();
          return { y: n.getFullYear(), m: n.getMonth() };
        })(),
  );

  const parsedY = parsed?.y;
  const parsedM = parsed?.m;
  useEffect(() => {
    if (!open || parsedY == null || parsedM == null) return;
    setCursor({ y: parsedY, m: parsedM });
  }, [open, parsedY, parsedM]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let top = r.bottom + 8;
      let left = r.left;
      if (top + POPOVER_H > window.innerHeight - 8) {
        top = Math.max(8, r.top - POPOVER_H - 8);
      }
      if (left + POPOVER_W > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - POPOVER_W - 8);
      }
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const pad = mondayOffset(first.getDay());
    const out: { iso: string; inMonth: boolean; day: number }[] = [];
    const prevDays = new Date(cursor.y, cursor.m, 0).getDate();
    for (let i = pad; i > 0; i--) {
      const day = prevDays - i + 1;
      const prev =
        cursor.m === 0
          ? { y: cursor.y - 1, m: 11 }
          : { y: cursor.y, m: cursor.m - 1 };
      out.push({ iso: isoFrom(prev.y, prev.m, day), inMonth: false, day });
    }
    for (let day = 1; day <= days; day++) {
      out.push({ iso: isoFrom(cursor.y, cursor.m, day), inMonth: true, day });
    }
    while (out.length % 7 !== 0) {
      const extra = out.length - pad - days + 1;
      const next =
        cursor.m === 11
          ? { y: cursor.y + 1, m: 0 }
          : { y: cursor.y, m: cursor.m + 1 };
      out.push({ iso: isoFrom(next.y, next.m, extra), inMonth: false, day: extra });
    }
    return out;
  }, [cursor]);

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const popover =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={monthTitle(cursor.y, cursor.m)}
            className="fixed z-[1200] w-[17.5rem] rounded-xl2 border border-white/10 bg-ink-900 p-3 shadow-xl"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mist-300 hover:bg-white/5 hover:text-mist-100"
                aria-label="Previous month"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <p className="font-display text-sm font-semibold text-mist-100">
                {monthTitle(cursor.y, cursor.m)}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-mist-300 hover:bg-white/5 hover:text-mist-100"
                aria-label="Next month"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={`${d}-${i}`}
                  className="py-1 text-center text-[10px] font-medium uppercase tracking-wider text-mist-500"
                >
                  {d}
                </div>
              ))}
              {cells.map((cell) => {
                const isSel = cell.iso === value;
                const isToday = cell.iso === today;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      onChange(cell.iso);
                      setOpen(false);
                    }}
                    className={`h-8 rounded-lg text-xs tabular-nums transition-colors ${
                      isSel
                        ? "bg-aurora-400 font-semibold text-on-accent"
                        : isToday
                          ? "bg-white/[0.06] font-medium text-aurora-300 ring-1 ring-white/15"
                          : "text-mist-200 hover:bg-white/[0.05]"
                    } ${cell.inMonth ? "" : "opacity-35"}`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
              className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-mist-400 hover:bg-white/5 hover:text-mist-100"
            >
              Today
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={className}>
      {label ? (
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-mist-500">
          {label}
        </span>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ?? "Date"}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-left text-sm text-mist-100 outline-none transition-colors hover:border-white/20 focus-visible:border-aurora-400/60 disabled:opacity-50"
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-mist-400" />
        <span className="min-w-0 flex-1 truncate">{formatField(value)}</span>
      </button>
      {popover}
    </div>
  );
}

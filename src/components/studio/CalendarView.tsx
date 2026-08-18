"use client";

import { useMemo, useState } from "react";
import type { FollowUpKind, LeadWithOutreach } from "@/lib/types";
import {
  calendarEventsFromLeads,
  followUpKindLabel,
  formatNoteDate,
  isMissedCallNote,
  todayIsoDate,
  type CalendarEvent,
} from "@/lib/follow-ups";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MailIcon,
  PhoneIcon,
} from "@/components/icons";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const KIND_DOT: Record<FollowUpKind, string> = {
  follow_up: "bg-violet-400",
  note: "bg-mist-500",
  email: "bg-aurora-400",
  phone: "bg-sky-400",
};

const KIND_CHIP: Record<FollowUpKind, string> = {
  follow_up: "bg-violet-400/15 text-violet-200",
  note: "bg-white/10 text-mist-300",
  email: "bg-aurora-400/15 text-aurora-200",
  phone: "bg-sky-400/15 text-sky-200",
};

function isoFromParts(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function mondayOffset(jsSundayZero: number): number {
  return (jsSundayZero + 6) % 7;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function KindMark({ kind }: { kind: FollowUpKind }) {
  if (kind === "email") return <MailIcon className="h-3.5 w-3.5" aria-hidden />;
  if (kind === "phone") return <PhoneIcon className="h-3.5 w-3.5" aria-hidden />;
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${KIND_DOT[kind]}`}
      aria-hidden
    />
  );
}

export function CalendarView({
  leads,
  onOpenLead,
  onToggleFollowUp,
}: {
  leads: LeadWithOutreach[];
  onOpenLead: (leadId: string) => void;
  onToggleFollowUp?: (leadId: string, followUpId: string, done: boolean) => void;
}) {
  const today = todayIsoDate();
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [selected, setSelected] = useState(today);

  const events = useMemo(() => calendarEventsFromLeads(leads), [leads]);
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const order: Record<FollowUpKind, number> = {
          follow_up: 0,
          phone: 1,
          email: 2,
          note: 3,
        };
        const d = order[a.kind] - order[b.kind];
        if (d !== 0) return d;
        return a.company.localeCompare(b.company);
      });
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const { year, month } = cursor;
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const pad = mondayOffset(first.getDay());
    const out: { iso: string; inMonth: boolean; day: number }[] = [];
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = pad; i > 0; i--) {
      const day = prevDays - i + 1;
      const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
      out.push({
        iso: isoFromParts(prev.year, prev.month, day),
        inMonth: false,
        day,
      });
    }
    for (let day = 1; day <= days; day++) {
      out.push({ iso: isoFromParts(year, month, day), inMonth: true, day });
    }
    while (out.length % 7 !== 0) {
      const extra = out.length - pad - days + 1;
      const next =
        month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
      out.push({
        iso: isoFromParts(next.year, next.month, extra),
        inMonth: false,
        day: extra,
      });
    }
    return out;
  }, [cursor]);

  const dayEvents = byDate.get(selected) ?? [];
  const followUps = dayEvents.filter((e) => e.kind === "follow_up");
  const emails = dayEvents.filter((e) => e.kind === "email");
  const calls = dayEvents.filter((e) => e.kind === "phone");
  const weekRows = cells.length / 7;

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      const next = { year: d.getFullYear(), month: d.getMonth() };
      const nextToday = isoFromParts(now.getFullYear(), now.getMonth(), now.getDate());
      const inThis =
        next.year === now.getFullYear() && next.month === now.getMonth();
      setSelected(
        inThis
          ? nextToday
          : isoFromParts(next.year, next.month, 1),
      );
      return next;
    });
  };

  const goToday = () => {
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelected(today);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:flex-row lg:items-stretch lg:overflow-hidden">
      <section className="glass flex min-h-0 min-w-0 flex-1 flex-col rounded-xl2 p-4 sm:p-5">
        <div className="relative mb-3 flex shrink-0 items-center justify-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
              aria-label="Previous month"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <h2 className="min-w-[10rem] text-center font-display text-xl font-semibold text-mist-100">
              {monthLabel(cursor.year, cursor.month)}
            </h2>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
              aria-label="Next month"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-mist-300 transition-colors hover:border-aurora-400/40 hover:text-mist-100"
          >
            Today
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            role="grid"
            aria-label={`Calendar for ${monthLabel(cursor.year, cursor.month)}`}
            className="grid min-h-0 flex-1 grid-cols-7 gap-1"
            style={{
              gridTemplateRows: `auto repeat(${weekRows}, minmax(0, 1fr))`,
            }}
          >
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                role="columnheader"
                className="px-1 py-1 text-center text-[11px] font-medium uppercase tracking-wider text-mist-500"
              >
                {d}
              </div>
            ))}
            {cells.map((cell) => {
              const dayEvs = byDate.get(cell.iso) ?? [];
              const kinds = [...new Set(dayEvs.map((e) => e.kind))];
              const isToday = cell.iso === today;
              const isSelected = cell.iso === selected;
              const pending = dayEvs.filter(
                (e) => e.kind === "follow_up" && !e.done,
              ).length;
              const summary = dayEvs.length
                ? `${dayEvs.length} item${dayEvs.length === 1 ? "" : "s"}`
                : "no items";
              return (
                <button
                  key={cell.iso}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${formatNoteDate(cell.iso)}, ${summary}`}
                  onClick={() => setSelected(cell.iso)}
                  className={`flex h-full min-h-0 flex-col items-start rounded-xl px-1.5 py-1.5 text-left transition-colors ${
                    isSelected
                      ? "bg-aurora-400/15 ring-1 ring-aurora-400/50"
                      : isToday
                        ? "bg-white/[0.04] ring-1 ring-white/15"
                        : "hover:bg-white/[0.04]"
                  } ${cell.inMonth ? "" : "opacity-40"}`}
                >
                  <span
                    className={`text-xs tabular-nums ${
                      isToday
                        ? "font-semibold text-aurora-300"
                        : "text-mist-200"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {kinds.length > 0 ? (
                    <span className="mt-auto flex flex-wrap items-center gap-0.5 pt-1">
                      {kinds.map((k) => (
                        <span
                          key={k}
                          className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[k]}`}
                        />
                      ))}
                      {pending > 0 ? (
                        <span className="sr-only">
                          {pending} open follow-up{pending === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-4 text-[11px] text-mist-400">
          <li className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${KIND_DOT.follow_up}`} />
            Follow-up
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${KIND_DOT.email}`} />
            Email sent
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${KIND_DOT.phone}`} />
            Phone call
          </li>
        </ul>
      </section>

      <aside className="glass flex min-h-0 w-full shrink-0 flex-col self-stretch rounded-xl2 p-4 sm:p-5 lg:w-[22rem] lg:overflow-hidden">
        <p className="text-[11px] uppercase tracking-wider text-mist-500">
          {selected === today ? "Today" : formatNoteDate(selected)}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-mist-100">
          {dayEvents.length === 0
            ? "Nothing logged"
            : `${dayEvents.length} on this day`}
        </h3>

        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
          {dayEvents.length === 0 ? (
            <p className="text-sm leading-relaxed text-mist-400">
              Add a dated follow-up in a lead’s notes, send an email, or log a
              phone call — they show up here.
            </p>
          ) : (
            <>
              <DayGroup
                title="Follow-ups"
                events={followUps}
                onOpenLead={onOpenLead}
                onToggleFollowUp={onToggleFollowUp}
              />
              <DayGroup
                title="Emails sent"
                events={emails}
                onOpenLead={onOpenLead}
              />
              <DayGroup
                title="Phone calls"
                events={calls}
                onOpenLead={onOpenLead}
              />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function DayGroup({
  title,
  events,
  onOpenLead,
  onToggleFollowUp,
}: {
  title: string;
  events: CalendarEvent[];
  onOpenLead: (leadId: string) => void;
  onToggleFollowUp?: (leadId: string, followUpId: string, done: boolean) => void;
}) {
  if (events.length === 0) return null;
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-mist-500">
        {title}
      </h4>
      <ul className="space-y-2">
        {events.map((ev) => {
          const missed = ev.kind === "phone" && isMissedCallNote(ev.note);
          return (
          <li key={ev.id}>
            <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-ink-950/40 p-2.5">
              {onToggleFollowUp && ev.kind === "follow_up" ? (
                <button
                  type="button"
                  onClick={() => onToggleFollowUp(ev.leadId, ev.id, !ev.done)}
                  aria-pressed={ev.done}
                  aria-label={
                    ev.done ? "Mark follow-up not done" : "Mark follow-up done"
                  }
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    ev.done
                      ? "border-aurora-400/40 bg-aurora-400/20 text-aurora-200"
                      : "border-violet-400/40 text-violet-300 hover:border-violet-400/70 hover:text-violet-200"
                  }`}
                >
                  {ev.done ? <CheckIcon className="h-3 w-3" /> : null}
                </button>
              ) : (
                <span
                  className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    missed ? "bg-amber-400/15 text-amber-200" : KIND_CHIP[ev.kind]
                  }`}
                  title={missed ? "Missed call" : followUpKindLabel(ev.kind)}
                >
                  <KindMark kind={ev.kind} />
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenLead(ev.leadId)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="flex min-w-0 items-baseline gap-1.5">
                  <span
                    className={`truncate text-sm font-medium ${
                      ev.done ? "text-mist-400 line-through" : "text-mist-100"
                    }`}
                  >
                    {ev.company}
                  </span>
                  {missed ? (
                    <span className="shrink-0 text-[10px] font-medium text-amber-200">
                      Missed
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-mist-400">
                  {ev.note || followUpKindLabel(ev.kind)}
                </p>
              </button>
            </div>
          </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { FollowUpKind, LeadWithOutreach } from "@/lib/types";
import {
  calendarEventsFromLeads,
  followUpKindLabel,
  formatNoteDate,
  isMissedCallNote,
  isOverdueFollowUp,
  todayIsoDate,
  type CalendarEvent,
} from "@/lib/follow-ups";
import {
  CalendarIcon,
  CheckIcon,
  MailIcon,
  PhoneIcon,
} from "@/components/icons";
import { CalendarDaysIcon } from "@/components/lucide-animated/calendar-days";
import { ChevronLeftIcon as AnimatedChevronLeft } from "@/components/lucide-animated/chevron-left";
import { ChevronRightIcon as AnimatedChevronRight } from "@/components/lucide-animated/chevron-right";
import { MailCheckIcon } from "@/components/lucide-animated/mail-check";
import { PhoneIcon as AnimatedPhoneIcon } from "@/components/lucide-animated/phone";
import { PhoneMissedIcon } from "@/components/lucide-animated/phone-missed";
import { useIconMotion } from "@/components/lucide-animated/hover";
import { Lockable, useBoardLockUi } from "@/components/studio/board-lock";

const KIND_ORDER: FollowUpKind[] = ["follow_up", "email", "phone"];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const KIND_DOT: Record<FollowUpKind, string> = {
  follow_up: "bg-violet-400",
  note: "bg-amber-400",
  email: "bg-aurora-400",
  phone: "bg-sky-400",
};

const KIND_CHIP: Record<FollowUpKind, string> = {
  follow_up: "bg-violet-400/15 text-violet-200",
  note: "bg-amber-400/15 text-amber-200",
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
  if (kind === "follow_up") {
    return <CalendarIcon className="h-3.5 w-3.5" aria-hidden />;
  }
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${KIND_DOT[kind]}`}
      aria-hidden
    />
  );
}

function DayKindMark({ kind }: { kind: FollowUpKind }) {
  if (kind === "email") {
    return (
      <MailIcon className="h-3.5 w-3.5 text-aurora-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]" aria-hidden />
    );
  }
  if (kind === "phone") {
    return (
      <PhoneIcon className="h-3.5 w-3.5 text-sky-400 drop-shadow-[0_0_4px_rgba(56,189,248,0.45)]" aria-hidden />
    );
  }
  if (kind === "follow_up") {
    return (
      <CalendarIcon className="h-3.5 w-3.5 text-violet-300 drop-shadow-[0_0_4px_rgba(167,139,250,0.55)]" aria-hidden />
    );
  }
  return (
    <span className={`h-2.5 w-2.5 rounded-full ${KIND_DOT[kind]}`} aria-hidden />
  );
}

function kindCounts(events: CalendarEvent[]): Record<FollowUpKind, number> {
  const counts: Record<FollowUpKind, number> = {
    follow_up: 0,
    email: 0,
    phone: 0,
    note: 0,
  };
  for (const ev of events) counts[ev.kind] += 1;
  return counts;
}

function missedCallCount(events: CalendarEvent[]): number {
  return events.filter((e) => e.kind === "phone" && isMissedCallNote(e.note))
    .length;
}

function MonthChevron({
  dir,
  onClick,
}: {
  dir: "prev" | "next";
  onClick: () => void;
}) {
  const { ref, bind } = useIconMotion();
  const Icon = dir === "prev" ? AnimatedChevronLeft : AnimatedChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
      aria-label={dir === "prev" ? "Previous month" : "Next month"}
      {...bind}
    >
      <Icon ref={ref} size={16} className="flex" aria-hidden />
    </button>
  );
}

function LegendItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="inline-flex items-center gap-1.5">
      {children}
      {label}
    </li>
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
  const { locked: editLocked, holder } = useBoardLockUi();
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
            <MonthChevron dir="prev" onClick={() => shiftMonth(-1)} />
            <h2 className="min-w-[10rem] text-center font-display text-xl font-semibold text-mist-100">
              {monthLabel(cursor.year, cursor.month)}
            </h2>
            <MonthChevron dir="next" onClick={() => shiftMonth(1)} />
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
              const counts = kindCounts(dayEvs);
              const missed = missedCallCount(dayEvs);
              const isToday = cell.iso === today;
              const isSelected = cell.iso === selected;
              const pending = dayEvs.filter(
                (e) => e.kind === "follow_up" && !e.done,
              ).length;
              const overdue = dayEvs.some(
                (e) =>
                  e.kind === "follow_up" &&
                  isOverdueFollowUp(e.date, e.done, today),
              );
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
                  aria-label={`${formatNoteDate(cell.iso)}, ${summary}${
                    overdue ? ", overdue follow-up" : ""
                  }${missed ? `, ${missed} missed call${missed === 1 ? "" : "s"}` : ""}`}
                  onClick={() => setSelected(cell.iso)}
                  className={`flex h-full min-h-0 flex-col items-start rounded-xl px-1.5 py-1.5 text-left transition-colors ${
                    isSelected
                      ? overdue
                        ? "bg-rose-400/20 ring-1 ring-rose-400/60"
                        : "bg-aurora-400/15 ring-1 ring-aurora-400/50"
                      : overdue
                        ? "bg-rose-400/15 ring-1 ring-rose-400/50"
                        : isToday
                          ? "bg-white/[0.04] ring-1 ring-white/15"
                          : "hover:bg-white/[0.04]"
                  } ${cell.inMonth ? "" : "opacity-40"}`}
                >
                  <span
                    className={`text-xs tabular-nums ${
                      isToday && !overdue
                        ? "font-semibold text-aurora-300"
                        : "text-mist-200"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {KIND_ORDER.some((k) => counts[k] > 0) ? (
                    <span className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                      {KIND_ORDER.map((k) => {
                        const n = counts[k];
                        if (n === 0) return null;
                        return (
                          <span
                            key={k}
                            className="inline-flex items-center gap-0.5"
                          >
                            <DayKindMark kind={k} />
                            <span className="text-[10px] font-medium tabular-nums text-mist-400">
                              {n}
                            </span>
                          </span>
                        );
                      })}
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

        <ul className="relative mt-3 flex shrink-0 flex-wrap items-center justify-center gap-4 pr-24 text-[11px] text-mist-400">
          <LegendItem label="Follow up">
            <CalendarDaysIcon size={14} className="flex text-violet-300" aria-hidden />
          </LegendItem>
          <LegendItem label="Email sent">
            <MailCheckIcon size={14} className="flex text-aurora-400" aria-hidden />
          </LegendItem>
          <LegendItem label="Phone call">
            <AnimatedPhoneIcon size={14} className="flex text-sky-400" aria-hidden />
          </LegendItem>
          <li className="absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 rounded-sm bg-rose-400/20 ring-1 ring-rose-400/50"
              aria-hidden
            />
            Overdue
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
        {editLocked ? (
          <p className="mt-2 rounded-lg border border-aurora-400/20 bg-aurora-400/5 px-3 py-2 text-xs text-aurora-100/90">
            {holder ?? "Someone else"} is editing this board. Take control to
            mark follow-ups done.
          </p>
        ) : null}

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
                kind="follow_up"
                events={followUps}
                onOpenLead={onOpenLead}
                onToggleFollowUp={onToggleFollowUp}
              />
              <DayGroup
                title="Emails sent"
                kind="email"
                events={emails}
                onOpenLead={onOpenLead}
              />
              <DayGroup
                title="Phone calls"
                kind="phone"
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

function GroupTitle({
  title,
  kind,
  count,
  missed = 0,
}: {
  title: string;
  kind: FollowUpKind;
  count: number;
  missed?: number;
}) {
  const color =
    kind === "email"
      ? "text-aurora-400"
      : kind === "phone"
        ? "text-sky-400"
        : "text-violet-300";
  return (
    <h4 className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-mist-500">
      {kind === "email" ? (
        <MailCheckIcon size={14} className={`flex ${color}`} aria-hidden />
      ) : kind === "phone" ? (
        missed > 0 ? (
          <PhoneMissedIcon size={14} className={`flex ${color}`} aria-hidden />
        ) : (
          <AnimatedPhoneIcon size={14} className={`flex ${color}`} aria-hidden />
        )
      ) : (
        <CalendarDaysIcon size={14} className={`flex ${color}`} aria-hidden />
      )}
      {title}
      <span className="tabular-nums text-mist-300">{count}</span>
      {kind === "phone" && missed > 0 ? (
        <span className="font-normal normal-case tracking-normal text-mist-500">
          · {missed} missed
        </span>
      ) : null}
    </h4>
  );
}

function DayGroup({
  title,
  kind,
  events,
  onOpenLead,
  onToggleFollowUp,
}: {
  title: string;
  kind: FollowUpKind;
  events: CalendarEvent[];
  onOpenLead: (leadId: string) => void;
  onToggleFollowUp?: (leadId: string, followUpId: string, done: boolean) => void;
}) {
  const { locked: editLocked, hint: lockHint } = useBoardLockUi();
  if (events.length === 0) return null;
  const missed = missedCallCount(events);
  return (
    <section>
      <GroupTitle title={title} kind={kind} count={events.length} missed={missed} />
      <ul className="space-y-2">
        {events.map((ev) => {
          const isMissed = ev.kind === "phone" && isMissedCallNote(ev.note);
          const overdue =
            ev.kind === "follow_up" && isOverdueFollowUp(ev.date, ev.done);
          return (
          <li key={ev.id}>
            <div
              className={`flex items-start gap-2 rounded-xl border p-2.5 ${
                overdue
                  ? "border-rose-400/40 bg-rose-400/10"
                  : "border-white/5 bg-ink-950/40"
              }`}
            >
              {onToggleFollowUp && ev.kind === "follow_up" ? (
                <Lockable>
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => onToggleFollowUp(ev.leadId, ev.id, !ev.done)}
                    aria-pressed={ev.done}
                    aria-label={
                      editLocked
                        ? lockHint
                        : ev.done
                          ? "Mark follow-up not done"
                          : "Mark follow-up done"
                    }
                    title={
                      editLocked
                        ? lockHint
                        : ev.done
                          ? "Mark follow-up not done"
                          : "Mark follow-up done"
                    }
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                      ev.done
                        ? "border-aurora-400/40 bg-aurora-400/20 text-aurora-200"
                        : "border-violet-400/40 text-violet-300 hover:border-violet-400/70 hover:text-violet-200"
                    }`}
                  >
                    {ev.done ? <CheckIcon className="h-3 w-3" /> : null}
                  </button>
                </Lockable>
              ) : (
                <span
                  className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    isMissed ? "bg-white/10 text-mist-400" : KIND_CHIP[ev.kind]
                  }`}
                  title={isMissed ? "Missed call" : followUpKindLabel(ev.kind)}
                >
                  {isMissed ? (
                    <PhoneMissedIcon size={14} className="flex" aria-hidden />
                  ) : (
                    <KindMark kind={ev.kind} />
                  )}
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
                      ev.kind === "follow_up" && ev.done
                        ? "text-mist-400 line-through"
                        : "text-mist-100"
                    }`}
                  >
                    {ev.company}
                  </span>
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


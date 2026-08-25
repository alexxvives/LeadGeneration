"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * While `loadingMore`, keep the first-seen order and append newcomers at the
 * end — prevents cards jumping into the top of a column mid-backfill.
 */
export function useStableDuringLoad<T extends { id: string }>(
  items: T[],
  compare: (a: T, b: T) => number,
  loadingMore: boolean,
): T[] {
  const frozenIdsRef = useRef<string[] | null>(null);

  if (!loadingMore) {
    frozenIdsRef.current = null;
  } else if (frozenIdsRef.current) {
    const live = new Set(items.map((i) => i.id));
    if (frozenIdsRef.current.some((id) => !live.has(id))) {
      frozenIdsRef.current = frozenIdsRef.current.filter((id) => live.has(id));
    }
  }

  useEffect(() => {
    if (loadingMore) {
      if (frozenIdsRef.current === null && items.length > 0) {
        frozenIdsRef.current = [...items].sort(compare).map((i) => i.id);
      }
    } else {
      frozenIdsRef.current = null;
    }
  }, [loadingMore, items, compare]);

  return useMemo(() => {
    const sorted = [...items].sort(compare);
    const frozen = frozenIdsRef.current;
    if (!loadingMore || !frozen) return sorted;
    const byId = new Map(items.map((i) => [i.id, i]));
    const head: T[] = [];
    for (const id of frozen) {
      const item = byId.get(id);
      if (item) head.push(item);
    }
    const seen = new Set(head.map((i) => i.id));
    const tail = sorted.filter((i) => !seen.has(i.id));
    return [...head, ...tail];
  }, [items, loadingMore, compare]);
}

/** Show skeleton only after `delayMs` of continuous loading (avoids flash on fast loads).
 *  `delayMs <= 0` shows immediately (no empty frame before the effect tick). */
export function useDeferredLoading(loading: boolean, delayMs = 200): boolean {
  const [show, setShow] = useState(() => loading && delayMs <= 0);
  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    if (delayMs <= 0) {
      setShow(true);
      return;
    }
    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [loading, delayMs]);
  if (loading && delayMs <= 0) return true;
  return show;
}

/** While `loading`, wait `delayMs` then render `skeleton`; otherwise `children`. */
export function DeferredSkeleton({
  loading,
  skeleton,
  children,
  delayMs = 200,
  placeholderClassName = "min-h-[40vh]",
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  delayMs?: number;
  /** Reserve space before the delay elapses so layout doesn’t jump. */
  placeholderClassName?: string;
}) {
  const show = useDeferredLoading(loading, delayMs);
  if (!loading) return <>{children}</>;
  if (!show) return <div className={placeholderClassName} aria-hidden />;
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      {skeleton}
    </div>
  );
}

export function Bone({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md border border-white/5 bg-ink-950/40 shimmer ${className}`}
      aria-hidden
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="animate-float-up space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass rounded-xl2 p-5">
            <Bone className="h-3 w-20" />
            <Bone className="mt-3 h-8 w-16" />
            <Bone className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-xl2 p-6">
          <Bone className="h-5 w-36" />
          <Bone className="mt-2 h-3 w-40" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j}>
                <div className="mb-1 flex justify-between">
                  <Bone className="h-3 w-24" />
                  <Bone className="h-3 w-8" />
                </div>
                <Bone className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-xl2 p-6">
          <div className="flex items-center justify-between">
            <div>
              <Bone className="h-5 w-20" />
              <Bone className="mt-2 h-3 w-40" />
            </div>
            <Bone className="h-3 w-14" />
          </div>
          <ul className="mt-5 space-y-3">
            {Array.from({ length: 4 }, (_, j) => (
              <li key={j}>
                <div className="flex items-center justify-between gap-2">
                  <Bone className="h-4 w-28" />
                  <Bone className="h-3 w-20" />
                </div>
                <Bone className="mt-1.5 h-1.5 w-full rounded-full" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function BoardsSkeleton() {
  return (
    <div className="animate-float-up">
      <ul className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="glass rounded-xl2 p-5">
            <div className="flex items-start justify-between gap-2">
              <Bone className="h-6 w-36 max-w-full" />
              <Bone className="h-7 w-16 rounded-full" />
            </div>
            <div className="mt-4 space-y-1 text-center">
              <Bone className="mx-auto h-3 w-10" />
              <Bone className="mx-auto h-8 w-12" />
            </div>
            <div className="mt-3 border-t border-white/8 pt-3">
              <Bone className="h-3 w-24" />
              <Bone className="mt-2 h-3 w-40 max-w-full" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/8 pt-3 text-center">
              {Array.from({ length: 3 }, (_, j) => (
                <div key={j} className="space-y-1">
                  <Bone className="mx-auto h-3 w-12" />
                  <Bone className="mx-auto h-6 w-8" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RunsSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl2 border border-white/10">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className={`grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] sm:gap-4 ${
            i > 0 ? "border-t border-white/5" : ""
          }`}
        >
          <div className="min-w-0 space-y-2">
            <Bone className="h-4 w-64 max-w-full" />
            <Bone className="h-3 w-48 max-w-full" />
          </div>
          <Bone className="h-4 w-16 sm:justify-self-end" />
          <Bone className="h-3 w-20 sm:justify-self-center" />
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="glass min-w-0 flex-1 rounded-xl2 p-5">
        <div className="mb-4 flex items-center justify-between">
          <Bone className="h-7 w-40" />
          <Bone className="h-8 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => (
            <Bone key={i} className="min-h-[3.25rem] rounded-xl sm:min-h-[4.25rem]" />
          ))}
        </div>
      </div>
      <div className="glass w-full rounded-xl2 p-5 lg:w-[22rem]">
        <Bone className="h-3 w-24" />
        <Bone className="mt-2 h-6 w-36" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Bone className="h-3 w-56 shrink-0" />
      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{ gridTemplateColumns: "repeat(4, minmax(11rem, 1fr))" }}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex min-h-0 flex-col rounded-xl2 border border-white/10 bg-ink-900/40"
          >
            <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
              <Bone className="h-2.5 w-2.5 rounded-full" />
              <Bone className="h-3 w-20" />
              <Bone className="ml-auto h-5 w-7 rounded-md" />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {Array.from({ length: 3 }, (_, j) => (
                <div
                  key={j}
                  className="flex items-start gap-1 rounded-xl border border-white/5 bg-ink-900/60 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Bone className="h-4 w-28 max-w-full" />
                    <Bone className="h-3 w-20" />
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Bone className="h-1 w-10 rounded-full" />
                      <Bone className="h-3 w-6" />
                      <Bone className="h-4 w-12 rounded-full" />
                    </div>
                  </div>
                  <Bone className="h-5 w-5 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 rounded-xl2 border border-white/10 bg-ink-900/40">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Bone className="h-2.5 w-2.5 rounded-full" />
          <Bone className="h-3 w-24" />
          <Bone className="ml-auto h-5 w-7 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function LeadsTableRowsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="h-full min-h-0 overflow-hidden rounded-xl2 border border-white/10">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-4 py-3">
              <Bone className="h-3 w-3" />
            </th>
            {(
              [
                "w-20",
                "w-12",
                "w-16",
                "w-16",
                "w-10",
                "w-16",
                "w-12",
              ] as const
            ).map((w, i) => (
              <th key={i} className="px-4 py-3">
                <Bone className={`h-3 ${w}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td className="px-4 py-3.5">
                <Bone className="h-3.5 w-3.5" />
              </td>
              <td className="px-4 py-3.5">
                <Bone className="h-4 w-36" />
                <Bone className="mt-1 h-3 w-24" />
              </td>
              <td className="hidden px-4 py-3.5 sm:table-cell">
                <Bone className="h-3 w-16" />
              </td>
              <td className="hidden px-4 py-3.5 md:table-cell">
                <Bone className="h-3 w-24" />
              </td>
              <td className="px-4 py-3.5">
                <Bone className="h-3 w-28" />
              </td>
              <td className="px-4 py-3.5">
                <Bone className="h-1.5 w-14 rounded-full" />
              </td>
              <td className="px-4 py-3.5">
                <Bone className="h-5 w-20 rounded-full" />
              </td>
              <td className="px-4 py-3.5">
                <Bone className="h-3 w-16" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeadsTableSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2">
          <Bone className="h-3 w-20" />
          <Bone className="h-8 w-24 rounded-full" />
        </div>
        <Bone className="h-8 w-48 rounded-full justify-self-start sm:justify-self-center" />
        <Bone className="h-8 w-36 justify-self-start sm:justify-self-end" />
      </div>
      <div className="min-h-0 flex-1">
        <LeadsTableRowsSkeleton />
      </div>
    </div>
  );
}

/** Content-only skeleton for table body (toolbar stays interactive). */
export function LeadsTableBodySkeleton() {
  return <LeadsTableRowsSkeleton />;
}

export function LeadsCardsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="glass rounded-xl2 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Bone className="h-5 w-40 max-w-full" />
              <Bone className="h-3 w-28" />
            </div>
            <Bone className="h-5 w-16 rounded-full" />
          </div>
          <Bone className="mt-3 h-3 w-full" />
          <Bone className="mt-2 h-3 w-4/5 max-w-full" />
          <div className="mt-4 flex gap-2">
            <Bone className="h-5 w-14 rounded-full" />
            <Bone className="h-5 w-14 rounded-full" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Bone className="h-4 w-10" />
            <Bone className="h-4 w-10" />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
            <Bone className="h-1.5 w-16 rounded-full" />
            <Bone className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Active leads layout body skeleton (table / cards / map). */
export function LeadsLayoutSkeleton({
  layout,
}: {
  layout: "table" | "cards" | "map";
}) {
  if (layout === "cards") return <LeadsCardsSkeleton />;
  if (layout === "map") return <MapSkeleton />;
  return <LeadsTableBodySkeleton />;
}

export function OutreachSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3 lg:items-stretch">
        {Array.from({ length: 3 }, (_, i) => (
          <section
            key={i}
            className="flex min-h-0 flex-col rounded-xl2 border border-white/10 bg-ink-950/40"
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/5 px-3 py-2.5">
              <div className="min-w-0 space-y-1.5">
                <Bone className="h-3 w-28" />
                <Bone className="h-3 w-36" />
              </div>
              {i === 0 ? (
                <Bone className="h-6 w-20 rounded-full" />
              ) : i === 1 ? (
                <Bone className="h-6 w-28 rounded-full" />
              ) : null}
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-white/5 overflow-hidden">
              {Array.from({ length: 5 }, (_, j) => (
                <li
                  key={j}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <Bone className="h-4 w-32 max-w-full" />
                    <Bone className="h-3 w-24" />
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Bone className="h-1 w-10 rounded-full" />
                    <Bone className="h-6 w-14 rounded-full" />
                    <Bone className="h-6 w-6 rounded-md" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div className="mb-8">
      <div className="glass rounded-xl2 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <Bone className="mb-1.5 h-3 w-40" />
            <Bone className="h-12 w-full rounded-lg" />
          </div>
          <div>
            <Bone className="mb-1.5 h-3 w-20" />
            <Bone className="h-12 w-full rounded-lg" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Bone className="h-8 w-40 rounded-full" />
          <Bone className="h-8 w-36 rounded-full justify-self-center" />
          <Bone className="h-9 w-40 justify-self-stretch sm:justify-self-end" />
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
          <Bone className="h-4 w-48 max-w-full" />
          <Bone className="mt-2 h-3 w-full max-w-md" />
        </div>
        <div className="mt-5 flex justify-center">
          <Bone className="h-11 w-36 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function AdminPlatformSkeleton() {
  const barHeights = [40, 55, 35, 70, 50, 85, 45, 60, 75, 48];
  return (
    <div className="animate-float-up space-y-8">
      <div className="flex justify-end">
        <Bone className="h-9 w-full max-w-xs rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass rounded-xl2 p-5">
            <Bone className="h-3 w-24" />
            <Bone className="mt-3 h-8 w-14" />
            <Bone className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-xl2 p-5">
          <Bone className="h-4 w-24" />
          <Bone className="mx-auto mt-6 h-40 w-40 rounded-full" />
        </div>
        <div className="glass rounded-xl2 p-5">
          <Bone className="h-4 w-40" />
          <div className="mt-4 flex h-40 items-end gap-2">
            {barHeights.map((h, i) => (
              <div
                key={i}
                className="w-full rounded-t border border-white/5 bg-ink-950/40 shimmer"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-xl2 p-5">
          <Bone className="h-4 w-28" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i}>
                <div className="mb-1 flex justify-between">
                  <Bone className="h-3 w-32" />
                  <Bone className="h-3 w-10" />
                </div>
                <Bone className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-xl2 p-5">
          <Bone className="h-4 w-28" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Bone className="h-20 w-full rounded-xl" />
            <Bone className="h-20 w-full rounded-xl" />
            <Bone className="col-span-2 h-24 w-full rounded-xl" />
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-xl2 p-5">
          <Bone className="h-4 w-40" />
          <ul className="mt-4 space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <div className="mb-1 flex justify-between">
                  <Bone className="h-3 w-32" />
                  <Bone className="h-3 w-10" />
                </div>
                <Bone className="h-2 w-full rounded-full" />
              </li>
            ))}
          </ul>
        </div>
        <div className="glass rounded-xl2 p-5">
          <Bone className="h-4 w-36" />
          <ul className="mt-4 divide-y divide-white/5">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center justify-between py-2.5">
                <Bone className="h-4 w-40" />
                <Bone className="h-3 w-16" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function AdminUsersSkeleton() {
  return (
    <div className="animate-float-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl2 border border-white/10 bg-ink-900/40 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Bone className="h-4 w-28" />
          <Bone className="h-3 w-full max-w-lg" />
        </div>
        <Bone className="h-9 w-52 rounded-full" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Bone className="h-9 w-48 rounded-lg" />
        <Bone className="h-9 min-w-[14rem] flex-1 rounded-lg" />
        <Bone className="h-9 w-36 rounded-lg" />
      </div>
      <div className="overflow-x-auto rounded-xl2 border border-white/8">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {(
                [
                  "w-14",
                  "w-12",
                  "w-16",
                  "w-16",
                  "w-16",
                  "w-12",
                  "w-12",
                  "w-14",
                  "w-6",
                ] as const
              ).map((w, i) => (
                <th key={i} className="px-4 py-3">
                  <Bone className={`h-3 ${w}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {Array.from({ length: 8 }, (_, i) => (
              <tr key={i}>
                <td className="px-4 py-3">
                  <Bone className="h-4 w-36" />
                  <Bone className="mt-1 h-3 w-24" />
                </td>
                <td className="px-4 py-3">
                  <Bone className="h-8 w-24 rounded-lg" />
                </td>
                <td className="px-4 py-3">
                  <Bone className="h-6 w-11 rounded-full" />
                </td>
                <td className="px-4 py-3">
                  <Bone className="h-3 w-16" />
                </td>
                <td className="px-4 py-3">
                  <Bone className="h-3 w-12" />
                </td>
                <td className="px-4 py-3">
                  <Bone className="h-3 w-14" />
                </td>
                <td className="px-4 py-3">
                  <Bone className="h-3 w-12" />
                </td>
                <td className="px-4 py-3">
                  <Bone className="h-3 w-16" />
                </td>
                <td className="px-2 py-3">
                  <Bone className="h-7 w-7 rounded-lg" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div className="relative h-full min-h-[240px] overflow-hidden rounded-xl2 border border-white/10 bg-ink-900">
      <div className="absolute inset-0 border-0 bg-ink-950/40 shimmer" />
      <div className="absolute right-4 top-4">
        <Bone className="h-7 w-28 rounded-full" />
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <Bone className="h-6 w-56 rounded-full sm:w-72" />
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <main
      className="relative mx-auto min-h-dvh max-w-7xl px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-5 sm:pt-8"
      role="status"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <Bone className="absolute right-3 top-3 h-8 w-8 rounded-full sm:right-5 sm:top-4" />
      <Bone className="h-9 w-36 sm:h-10" />
      <Bone className="mt-2 h-3.5 w-72 max-w-full" />

      <section className="mt-8">
        <Bone className="mb-3 h-3 w-32" />
        <div className="space-y-4 rounded-xl2 border border-white/10 p-5">
          <Bone className="h-10 w-56 rounded-lg" />
          <Bone className="h-3 w-80 max-w-full" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Bone className="h-10 w-full rounded-lg" />
              <Bone className="h-10 w-full rounded-lg" />
              <Bone className="h-40 w-full rounded-lg" />
            </div>
            <Bone className="h-56 w-full rounded-xl2" />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <Bone className="mb-3 h-3 w-40" />
        <div className="rounded-xl2 border border-white/10 p-5">
          <Bone className="h-4 w-36" />
          <Bone className="mt-2 h-3 w-64 max-w-full" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Bone className="h-10 w-full rounded-lg" />
            <Bone className="h-10 w-full rounded-lg" />
          </div>
          <Bone className="mt-4 h-10 w-full rounded-lg" />
          <Bone className="mt-4 h-12 w-full rounded-lg" />
        </div>
      </section>

      <section className="mt-8">
        <Bone className="mb-3 h-3 w-24" />
        <div className="rounded-xl2 border border-white/10 p-5">
          <Bone className="h-6 w-28" />
          <Bone className="mt-2 h-3 w-56" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Bone className="h-12 w-full rounded-lg" />
            <Bone className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <Bone className="mb-3 h-3 w-20" />
        <div className="overflow-hidden rounded-xl2 border border-white/10">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 p-5 ${
                i > 0 ? "border-t border-white/5" : ""
              }`}
            >
              <Bone className="h-5 w-5 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bone className="h-4 w-28" />
                <Bone className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/** Studio shell while the board payload loads — mirrors the active view. */
export function StudioViewSkeleton({
  view,
}: {
  view:
    | "board"
    | "pipeline"
    | "leads"
    | "outreach"
    | "calendar"
    | "runs"
    | "dashboard"
    | "boards"
    | "admin"
    | "admin-users";
}) {
  const title =
    view === "dashboard"
      ? "Dashboard"
      : view === "boards"
        ? "Boards"
        : view === "pipeline"
          ? "Pipeline"
          : view === "leads"
            ? "Leads"
            : view === "outreach"
              ? "Outreach"
              : view === "calendar"
                ? "Calendar"
                : view === "runs"
                  ? "Search runs"
                  : view === "admin"
                    ? "Dashboard"
                    : view === "admin-users"
                      ? "Users"
                      : "Search";

  const showUsage =
    view !== "admin" && view !== "admin-users" && view !== "boards";

  const body =
    view === "dashboard" ? (
      <DashboardSkeleton />
    ) : view === "boards" ? (
      <BoardsSkeleton />
    ) : view === "pipeline" ? (
      <div className="min-h-0 flex-1">
        <PipelineSkeleton />
      </div>
    ) : view === "leads" ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <LeadsTableSkeleton />
      </div>
    ) : view === "outreach" ? (
      <div className="min-h-0 flex-1">
        <OutreachSkeleton />
      </div>
    ) : view === "calendar" ? (
      <div className="min-h-0 flex-1">
        <CalendarSkeleton />
      </div>
    ) : view === "runs" ? (
      <RunsSkeleton />
    ) : view === "admin" ? (
      <AdminPlatformSkeleton />
    ) : view === "admin-users" ? (
      <AdminUsersSkeleton />
    ) : (
      <SearchSkeleton />
    );

  const fill =
    view === "pipeline" ||
    view === "outreach" ||
    view === "leads" ||
    view === "calendar";

  return (
    <main
      className="mx-auto flex h-dvh max-w-[90rem] flex-col overflow-hidden px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:px-3 sm:pt-8"
      role="status"
      aria-busy="true"
      aria-label={`Loading ${title}`}
    >
      <div className="mb-5 grid shrink-0 grid-cols-1 items-end gap-3 sm:mb-6 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Bone className="h-9 w-36 sm:h-10" />
            {view === "boards" ? (
              <Bone className="h-8 w-28 rounded-full" />
            ) : null}
            {view === "leads" ? (
              <Bone className="h-8 w-24 rounded-full" />
            ) : null}
          </div>
          <Bone className="mt-2 h-3 w-64 max-w-full" />
        </div>
        {showUsage ? (
          <div className="hidden justify-self-center sm:block">
            <div className="flex gap-3">
              <Bone className="h-10 w-28 rounded-lg" />
              <Bone className="h-10 w-28 rounded-lg" />
            </div>
          </div>
        ) : (
          <div />
        )}
        <div className="justify-self-start sm:justify-self-end">
          <Bone className="h-9 w-32 rounded-full" />
        </div>
      </div>
      <div
        className={
          fill
            ? "flex min-h-0 flex-1 flex-col"
            : "min-h-0 flex-1 overflow-y-auto overscroll-contain"
        }
      >
        {body}
      </div>
    </main>
  );
}

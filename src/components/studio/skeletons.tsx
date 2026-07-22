"use client";

import { useEffect, useState, type ReactNode } from "react";

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
        {[0, 1].map((i) => (
          <div key={i} className="glass rounded-xl2 p-6">
            <Bone className="h-5 w-36" />
            <Bone className="mt-2 h-3 w-48" />
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
        ))}
      </div>
    </div>
  );
}

export function BoardsSkeleton() {
  return (
    <div className="animate-float-up">
      <ul className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="glass rounded-xl2 p-5">
            <Bone className="h-5 w-40 max-w-full" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Bone className="h-8 w-full" />
              <Bone className="h-8 w-full" />
              <Bone className="h-8 w-full" />
            </div>
            <Bone className="mt-4 h-3 w-full" />
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

export function PipelineSkeleton() {
  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex w-[min(18rem,85vw)] shrink-0 flex-col rounded-xl2 border border-white/10 bg-ink-900/40"
        >
          <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
            <Bone className="h-2.5 w-2.5 rounded-full" />
            <Bone className="h-3 w-20" />
            <Bone className="ml-auto h-3 w-6" />
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            {Array.from({ length: 3 }, (_, j) => (
              <div
                key={j}
                className="rounded-xl border border-white/8 bg-ink-950/50 p-3"
              >
                <Bone className="h-4 w-3/4 max-w-[12rem]" />
                <Bone className="mt-2 h-3 w-1/2 max-w-[8rem]" />
                <Bone className="mt-3 h-1.5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadsTableSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <Bone className="h-3 w-24" />
        <Bone className="h-8 w-48 rounded-full justify-self-start sm:justify-self-center" />
        <Bone className="h-8 w-36 justify-self-start sm:justify-self-end" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl2 border border-white/10">
        <div className="border-b border-white/10 px-5 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 6 }, (_, i) => (
              <Bone key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-6 px-5 py-3.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bone className="h-4 w-40" />
                <Bone className="h-3 w-28" />
              </div>
              <Bone className="hidden h-3 w-24 sm:block" />
              <Bone className="hidden h-3 w-32 md:block" />
              <Bone className="h-3 w-28" />
              <Bone className="h-1.5 w-16 rounded-full" />
              <Bone className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Content-only skeleton for table body (toolbar stays interactive). */
export function LeadsTableBodySkeleton() {
  return (
    <div className="h-full min-h-0 overflow-hidden rounded-xl2 border border-white/10">
      <div className="border-b border-white/10 px-5 py-3">
        <div className="flex gap-8">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-3 w-16" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 px-5 py-3.5">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bone className="h-4 w-40" />
              <Bone className="h-3 w-28" />
            </div>
            <Bone className="hidden h-3 w-24 sm:block" />
            <Bone className="hidden h-3 w-32 md:block" />
            <Bone className="h-3 w-28" />
            <Bone className="h-1.5 w-16 rounded-full" />
            <Bone className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
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
          <Bone className="mt-4 h-3 w-full" />
          <Bone className="mt-2 h-3 w-4/5 max-w-full" />
          <div className="mt-4 flex gap-2">
            <Bone className="h-5 w-14 rounded-full" />
            <Bone className="h-5 w-14 rounded-full" />
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
    <div className="grid h-full min-h-0 gap-3 md:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="flex min-h-0 flex-col overflow-hidden rounded-xl2 border border-white/10"
        >
          <div className="border-b border-white/5 px-3 py-2.5">
            <Bone className="h-3 w-28" />
            <Bone className="mt-1.5 h-3 w-40" />
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            {Array.from({ length: 4 }, (_, j) => (
              <div
                key={j}
                className="rounded-xl border border-white/8 bg-ink-950/40 p-3"
              >
                <Bone className="h-4 w-3/4 max-w-[12rem]" />
                <Bone className="mt-2 h-3 w-1/2 max-w-[8rem]" />
                <div className="mt-3 flex gap-2">
                  <Bone className="h-6 w-16 rounded-full" />
                  <Bone className="h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div className="mb-8 space-y-4">
      <div className="glass rounded-xl2 p-6">
        <Bone className="h-5 w-40" />
        <Bone className="mt-2 h-3 w-64 max-w-full" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Bone className="h-11 w-full rounded-lg" />
          <Bone className="h-11 w-full rounded-lg" />
        </div>
        <Bone className="mt-4 h-11 w-36 rounded-full" />
      </div>
      <div className="rounded-xl2 border border-dashed border-white/10 p-6">
        <Bone className="mx-auto h-4 w-48" />
        <Bone className="mx-auto mt-3 h-3 w-64 max-w-full" />
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
    </div>
  );
}

export function AdminUsersSkeleton() {
  return (
    <div className="animate-float-up space-y-4">
      <div className="flex flex-wrap gap-3">
        <Bone className="h-9 w-48 rounded-lg" />
        <Bone className="h-9 w-36 rounded-lg" />
        <Bone className="h-9 w-40 rounded-lg" />
        <Bone className="ml-auto h-9 w-44 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-xl2 border border-white/10">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex gap-6">
            {Array.from({ length: 5 }, (_, i) => (
              <Bone key={i} className="h-3 w-20" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-4 py-3 ${
              i > 0 ? "border-t border-white/5" : ""
            }`}
          >
            <Bone className="h-4 w-40" />
            <Bone className="h-4 w-28" />
            <Bone className="h-5 w-16 rounded-full" />
            <Bone className="h-4 w-12" />
            <Bone className="ml-auto h-7 w-7 rounded-lg" />
          </div>
        ))}
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
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <Bone className="h-8 w-40" />
        <Bone className="mt-2 h-4 w-72 max-w-full" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="glass rounded-xl2 p-6">
          <Bone className="h-5 w-36" />
          <Bone className="mt-2 h-3 w-56 max-w-full" />
          <div className="mt-5 space-y-3">
            <Bone className="h-10 w-full rounded-lg" />
            <Bone className="h-10 w-full rounded-lg" />
            <Bone className="h-24 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
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
              : view === "runs"
                ? "Runs"
                : view === "admin"
                  ? "Platform"
                  : view === "admin-users"
                    ? "Users"
                    : "Search";

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
    view === "pipeline" || view === "outreach" || view === "leads";

  return (
    <main
      className="mx-auto flex h-dvh max-w-[90rem] flex-col overflow-hidden px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:px-3 sm:pt-8"
      role="status"
      aria-busy="true"
      aria-label={`Loading ${title}`}
    >
      <div className="mb-5 shrink-0 sm:mb-6">
        <Bone className="h-9 w-40 sm:h-10" />
        <Bone className="mt-2 h-3 w-64 max-w-full" />
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

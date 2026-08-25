"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const measureEl =
  typeof navigator !== "undefined" && !/Firefox/i.test(navigator.userAgent)
    ? (el: Element) => el.getBoundingClientRect().height
    : undefined;

/** Vertical window — Pipeline columns, Outreach buckets, parked stage. */
export function VirtualColumnList<T extends { id: string }>({
  items,
  estimateSize,
  overscan = 12,
  padding = 12,
  gap = 8,
  className = "",
  itemClassName = "px-3",
  renderItem,
}: {
  items: T[];
  estimateSize: number;
  overscan?: number;
  padding?: number;
  gap?: number;
  className?: string;
  itemClassName?: string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
    paddingStart: padding,
    paddingEnd: padding,
    getItemKey: (index) => items[index]?.id ?? index,
    measureElement: measureEl,
  });

  return (
    <div
      ref={parentRef}
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${className}`}
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index];
          if (!item) return null;
          return (
            <div
              key={item.id}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className={`absolute left-0 top-0 w-full ${itemClassName}`}
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <div style={{ paddingBottom: gap }}>{renderItem(item, vi.index)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Responsive card grid window for the Leads cards layout. */
export function VirtualCardGrid<T extends { id: string }>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(() => {
    if (typeof window === "undefined") return 3;
    const w = window.innerWidth;
    return w >= 1024 ? 3 : w >= 640 ? 2 : 1;
  });

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      setCols(w >= 1024 ? 3 : w >= 640 ? 2 : 1);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.max(1, Math.ceil(items.length / cols));
  const virtualizer = useVirtualizer({
    count: items.length === 0 ? 0 : rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 4,
    getItemKey: (index) => {
      const first = items[index * cols];
      return first?.id ?? index;
    },
    measureElement: measureEl,
  });

  if (items.length === 0) return null;

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto overscroll-contain"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const start = vi.index * cols;
          const row = items.slice(start, start + cols);
          return (
            <div
              key={row[0]?.id ?? vi.index}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <div
                className="grid gap-5 pb-5"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {row.map((item, i) => renderItem(item, start + i))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

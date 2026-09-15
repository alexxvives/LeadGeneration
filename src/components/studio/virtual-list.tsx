"use client";

import { useRef, type ReactNode } from "react";
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

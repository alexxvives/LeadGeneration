"use client";

import type { SelectHTMLAttributes } from "react";

/**
 * Shared native select — same chrome as Settings (`.select-ink`).
 * Use for all dropdowns so board filters, CRM picks, and settings match.
 */
export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select-ink ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

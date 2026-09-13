"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SearchIcon, XIcon } from "@/components/icons";

/**
 * Lead search: icon that expands in place below `lg`; always-visible field at `lg+`.
 * `icon` = phone-only control (Leads toolbar). `field` = desktop-only input.
 */
export function CollapsibleLeadSearch({
  value,
  onChange,
  mode = "responsive",
  onExpandedChange,
}: {
  value: string;
  onChange: (next: string) => void;
  mode?: "responsive" | "icon" | "field";
  onExpandedChange?: (open: boolean) => void;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(() => value.trim().length > 0);
  const narrowInputRef = useRef<HTMLInputElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (value.trim()) setOpen(true);
  }, [value]);

  useEffect(() => {
    onExpandedChange?.(open || value.trim().length > 0);
  }, [open, value, onExpandedChange]);

  useEffect(() => {
    if (open) narrowInputRef.current?.focus();
  }, [open]);

  const collapse = () => {
    setOpen(false);
    window.setTimeout(() => toggleRef.current?.focus(), 0);
  };

  const field = (
    <label
      htmlFor={inputId}
      className="relative inline-flex h-9 min-w-0 flex-1 items-center sm:w-56 sm:flex-none"
    >
      <span className="sr-only">Search leads</span>
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search leads…"
        data-testid="lead-search-input"
        className="h-full w-full rounded-xl border border-white/10 bg-ink-900/60 py-0 pl-3 pr-3 text-sm text-mist-100 outline-none placeholder:text-mist-600 focus:border-aurora-400/50"
      />
    </label>
  );

  const iconField = (
    <div className="flex min-h-11 min-w-0 flex-1 items-center gap-1">
      <label htmlFor={`${inputId}-narrow`} className="relative flex min-h-11 min-w-0 flex-1 items-center">
        <span className="sr-only">Search leads</span>
        <input
          id={`${inputId}-narrow`}
          ref={narrowInputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (value) onChange("");
              else collapse();
            }
          }}
          placeholder="Search leads…"
          data-testid="lead-search-input"
          className="h-11 w-full rounded-xl border border-white/10 bg-ink-900/60 py-0 pl-3 pr-10 text-sm text-mist-100 outline-none placeholder:text-mist-600 focus:border-aurora-400/50"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          onChange("");
          collapse();
        }}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-mist-400 transition-colors hover:bg-white/5 hover:text-mist-100"
        aria-label="Close search"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const toggle = (
    <button
      ref={toggleRef}
      type="button"
      data-testid="lead-search-toggle"
      aria-label="Search leads"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-mist-100 transition-colors hover:border-white/20"
    >
      <SearchIcon className="h-4 w-4" />
    </button>
  );

  const iconBlock = open || value.trim() ? iconField : toggle;

  if (mode === "field") return field;
  if (mode === "icon") return iconBlock;

  return (
    <>
      <div className="lg:hidden">{iconBlock}</div>
      <div className="hidden lg:block">{field}</div>
    </>
  );
}

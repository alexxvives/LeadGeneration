"use client";

import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";
import { plainToRich, sanitizePitchHtml } from "@/lib/outreach/rich-text";

/**
 * Lightweight rich pitch editor (bold / italic / underline + bullets).
 * Stores sanitized HTML; drafts/preview/send keep the formatting.
 */
export function PitchEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastExternal = useRef<string>("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const asHtml = /<[a-z][\s\S]*>/i.test(value) ? value : plainToRich(value);
    if (asHtml === lastExternal.current) return;
    if (document.activeElement === el) return;
    el.innerHTML = asHtml || "";
    lastExternal.current = asHtml;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizePitchHtml(el.innerHTML);
    lastExternal.current = html;
    onChange(html);
  };

  const cmd = (command: string) => {
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-ink-900/60 focus-within:border-aurora-400/60">
      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1.5">
        <ToolbarBtn
          label="Bold"
          onMouseDown={(e) => {
            e.preventDefault();
            cmd("bold");
          }}
        >
          <span className="font-bold">B</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Italic"
          onMouseDown={(e) => {
            e.preventDefault();
            cmd("italic");
          }}
        >
          <span className="italic">I</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Underline"
          onMouseDown={(e) => {
            e.preventDefault();
            cmd("underline");
          }}
        >
          <span className="underline">U</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Bullet list"
          onMouseDown={(e) => {
            e.preventDefault();
            cmd("insertUnorderedList");
          }}
        >
          <span className="text-[11px] leading-none">• ≡</span>
        </ToolbarBtn>
        <p className="ml-auto text-[10px] text-mist-600">
          Template text · placeholders OK
        </p>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline
        aria-label={placeholder ?? "Email body template"}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={onFocus}
        onInput={emit}
        onBlur={() => {
          emit();
          onBlur?.();
        }}
        className="min-h-[5.5rem] px-4 py-3 text-sm leading-relaxed text-mist-100 outline-none empty:before:pointer-events-none empty:before:text-mist-500 empty:before:content-[attr(data-placeholder)] [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5"
      />
    </div>
  );
}

function ToolbarBtn({
  label,
  children,
  onMouseDown,
}: {
  label: string;
  children: ReactNode;
  onMouseDown: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={onMouseDown}
      className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-2 text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
    >
      {children}
    </button>
  );
}

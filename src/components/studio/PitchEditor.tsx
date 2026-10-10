"use client";

import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  highlightTemplatePlaceholders,
  pitchHtmlForEditor,
  plainToRich,
  sanitizePitchHtml,
} from "@/lib/outreach/rich-text";

/**
 * Lightweight rich pitch editor (bold / italic / underline + bullets).
 * Pastes are sanitized (no white backgrounds / forced colors).
 * Stores sanitized HTML; drafts/preview/send keep the formatting.
 */
export function PitchEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  compact,
  disabled = false,
}: {
  value: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Shorter editor (e.g. sign-off). */
  compact?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastExternal = useRef<string>("");
  const focused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const asHtml = pitchHtmlForEditor(value);
    if (asHtml === lastExternal.current) return;
    // Never clobber the DOM while the user is typing (incl. caret inside child nodes).
    if (focused.current || (el.contains(document.activeElement) && document.activeElement !== document.body)) {
      return;
    }
    el.innerHTML = asHtml || "";
    lastExternal.current = asHtml;
  }, [value]);

  /**
   * Read the DOM and notify the parent. Do not write innerHTML here.
   * Assigning innerHTML clears the browser undo stack, so Ctrl+Z stopped
   * working after the first keystroke once `{company}` was tinted.
   * Placeholder tint is applied only when the field is not being edited.
   */
  const emit = () => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const html = sanitizePitchHtml(el.innerHTML);
    const tinted = highlightTemplatePlaceholders(html);
    lastExternal.current = tinted;
    onChange(html);
  };

  const cmd = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (html?.trim()) {
      document.execCommand("insertHTML", false, sanitizePitchHtml(html));
    } else if (text) {
      document.execCommand(
        "insertHTML",
        false,
        plainToRich(text.replace(/\r\n/g, "\n")),
      );
    }
    emit();
  };

  return (
    <div
      className={`overflow-hidden rounded-lg border border-white/10 bg-ink-900/60 focus-within:border-aurora-400/60 ${
        disabled ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-white/5 px-2 py-1.5">
        <ToolbarBtn
          label="Bold"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            cmd("bold");
          }}
        >
          <span className="font-bold">B</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Italic"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            cmd("italic");
          }}
        >
          <span className="italic">I</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Underline"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            cmd("underline");
          }}
        >
          <span className="underline">U</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Bullet list"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            cmd("insertUnorderedList");
          }}
        >
          <span className="text-[11px] leading-none">• ≡</span>
        </ToolbarBtn>
        <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden />
        <ToolbarBtn
          label="Clear formatting"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            const el = ref.current;
            if (!el) return;
            el.focus();
            document.execCommand("selectAll", false);
            document.execCommand("removeFormat", false);
            emit();
          }}
        >
          <span className="text-[10px] font-medium tracking-wide">Clear</span>
        </ToolbarBtn>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline
        aria-label={placeholder ?? "Email body template"}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => {
          focused.current = true;
          onFocus?.();
        }}
        onInput={() => emit()}
        onPaste={onPaste}
        onBlur={() => {
          focused.current = false;
          const el = ref.current;
          if (el) {
            const clean = sanitizePitchHtml(el.innerHTML);
            const tinted = highlightTemplatePlaceholders(clean);
            // Only rewrite DOM when tint markers actually change.
            if (el.innerHTML !== tinted) {
              el.innerHTML = tinted;
            }
            lastExternal.current = tinted;
            if (clean !== value) onChange(clean);
          }
          onBlur?.();
        }}
        className={`pitch-editor px-4 py-3 text-sm leading-relaxed text-mist-100 outline-none empty:before:pointer-events-none empty:before:text-mist-500 empty:before:content-[attr(data-placeholder)] [&_*]:!bg-transparent [&_:not([data-ph])]:!text-inherit [&_[data-ph]]:!text-aurora-300 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 ${
          compact ? "min-h-[4.5rem]" : "min-h-[5.5rem]"
        } ${disabled ? "cursor-not-allowed" : "cursor-text"}`}
      />
    </div>
  );
}

function ToolbarBtn({
  label,
  children,
  onMouseDown,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onMouseDown: (e: MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={onMouseDown}
      className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-2 text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

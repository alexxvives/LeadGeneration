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
  plainToRich,
  sanitizePitchHtml,
} from "@/lib/outreach/rich-text";

function toEditorHtml(value: string): string {
  const base = /<[a-z][\s\S]*>/i.test(value)
    ? sanitizePitchHtml(value)
    : plainToRich(value);
  return highlightTemplatePlaceholders(base);
}

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
}: {
  value: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastExternal = useRef<string>("");
  const focused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const asHtml = toEditorHtml(value);
    if (asHtml === lastExternal.current) return;
    // Never clobber the DOM while the user is typing (incl. caret inside child nodes).
    if (focused.current || (el.contains(document.activeElement) && document.activeElement !== document.body)) {
      return;
    }
    el.innerHTML = asHtml || "";
    lastExternal.current = asHtml;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizePitchHtml(el.innerHTML);
    lastExternal.current = highlightTemplatePlaceholders(html);
    onChange(html);
  };

  const cmd = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
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
    <div className="overflow-hidden rounded-lg border border-white/10 bg-ink-900/60 focus-within:border-aurora-400/60">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/5 px-2 py-1.5">
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
        <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden />
        <ToolbarBtn
          label="Clear formatting"
          onMouseDown={(e) => {
            e.preventDefault();
            const el = ref.current;
            if (!el) return;
            el.focus();
            document.execCommand("selectAll", false);
            document.execCommand("removeFormat", false);
            el.innerHTML = highlightTemplatePlaceholders(
              sanitizePitchHtml(el.innerHTML),
            );
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
        contentEditable={true}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => {
          focused.current = true;
          onFocus?.();
        }}
        onInput={emit}
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
        className="pitch-editor min-h-[5.5rem] cursor-text px-4 py-3 text-sm leading-relaxed text-mist-100 outline-none empty:before:pointer-events-none empty:before:text-mist-500 empty:before:content-[attr(data-placeholder)] [&_*]:!bg-transparent [&_:not([data-ph])]:!text-inherit [&_[data-ph]]:!text-aurora-300 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5"
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

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

/** Character offset of the caret within the editor (text nodes only). */
function caretTextOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaretTextOffset(root: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  let remaining = offset;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walk.nextNode() as Text | null;
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walk.nextNode() as Text | null;
  }
  // Past end — place at end.
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
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
  compact,
}: {
  value: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Shorter editor (e.g. sign-off). */
  compact?: boolean;
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

  const emit = (opts?: { rehighlight?: boolean }) => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizePitchHtml(el.innerHTML);
    onChange(html);
    const tinted = highlightTemplatePlaceholders(html);
    lastExternal.current = tinted;
    if (opts?.rehighlight && el.innerHTML !== tinted) {
      const caret = caretTextOffset(el);
      el.innerHTML = tinted;
      if (caret != null) setCaretTextOffset(el, caret);
    }
  };

  const cmd = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit({ rehighlight: true });
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
    emit({ rehighlight: true });
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
        onInput={() => emit({ rehighlight: true })}
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
        className={`pitch-editor cursor-text px-4 py-3 text-sm leading-relaxed text-mist-100 outline-none empty:before:pointer-events-none empty:before:text-mist-500 empty:before:content-[attr(data-placeholder)] [&_*]:!bg-transparent [&_:not([data-ph])]:!text-inherit [&_[data-ph]]:!text-aurora-300 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 ${
          compact ? "min-h-[4.5rem]" : "min-h-[5.5rem]"
        }`}
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

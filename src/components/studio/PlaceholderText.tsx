"use client";

import type { TextareaHTMLAttributes, InputHTMLAttributes } from "react";

const PLACEHOLDER_RE = /(\{(?:company|lead_name|location)\})/gi;

/** Split text so `{company}` / `{lead_name}` / `{location}` can be tinted. */
export function splitPlaceholders(text: string): { text: string; ph: boolean }[] {
  if (!text) return [];
  return text.split(PLACEHOLDER_RE).filter(Boolean).map((part) => ({
    text: part,
    ph: /^\{(?:company|lead_name|location)\}$/i.test(part),
  }));
}

function Mirror({ value, className }: { value: string; className: string }) {
  return (
    <div aria-hidden className={className}>
      {splitPlaceholders(value).map((p, i) =>
        p.ph ? (
          <span key={i} className="text-aurora-300">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
      {value.endsWith("\n") ? "\n" : null}
    </div>
  );
}

/** Mirror overlay that paints variables in aurora green over a transparent input. */
export function PlaceholderInput({
  value,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { value: string }) {
  const empty = !value;
  return (
    <div className={`relative ${className}`}>
      {!empty ? (
        <Mirror
          value={value}
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-4 py-3 text-sm text-mist-100"
        />
      ) : null}
      <input
        {...rest}
        value={value}
        className={
          empty
            ? "relative w-full bg-transparent px-4 py-3 text-sm text-mist-100 caret-mist-100 outline-none placeholder:text-mist-500"
            : "relative w-full bg-transparent px-4 py-3 text-sm text-transparent caret-mist-100 outline-none placeholder:text-mist-500"
        }
        style={empty ? undefined : { WebkitTextFillColor: "transparent" }}
      />
    </div>
  );
}

/** Same mirror trick for multi-line sign-off / plain templates. */
export function PlaceholderTextarea({
  value,
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const empty = !value;
  return (
    <div className={`relative ${className}`}>
      {!empty ? (
        <Mirror
          value={value}
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 py-3 font-sans text-sm leading-relaxed text-mist-100"
        />
      ) : null}
      <textarea
        {...rest}
        value={value}
        className={
          empty
            ? "relative w-full resize-y bg-transparent px-4 py-3 font-sans text-sm leading-relaxed text-mist-100 caret-mist-100 outline-none placeholder:text-mist-500"
            : "relative w-full resize-y bg-transparent px-4 py-3 font-sans text-sm leading-relaxed text-transparent caret-mist-100 outline-none placeholder:text-mist-500"
        }
        style={empty ? undefined : { WebkitTextFillColor: "transparent" }}
      />
    </div>
  );
}

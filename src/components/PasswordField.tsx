"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

const DEFAULT_INPUT =
  "w-full rounded-lg border border-white/10 bg-ink-900/60 py-3 pl-4 pr-11 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Extra classes merged onto the input (use for size variants). */
  inputClassName?: string;
  /**
   * Stand-in value when a secret is saved server-side (never the real key).
   * Cannot be revealed — eye is disabled; select field and paste to replace.
   */
  savedMask?: string;
};

/**
 * Password / secret input with show/hide toggle.
 * Secrets are never logged — this only flips the input `type`.
 */
export function PasswordField({
  className,
  inputClassName,
  disabled,
  savedMask,
  value,
  onChange,
  onFocus,
  ...rest
}: Props) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isMasked =
    typeof savedMask === "string" &&
    savedMask.length > 0 &&
    value === savedMask;

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        {...rest}
        ref={inputRef}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (isMasked && savedMask && e.target.value !== savedMask) {
            // Replace the stand-in mask instead of editing into the bullets.
            const next = e.target.value.replace(/•/g, "");
            e.target.value = next;
            onChange?.(e);
            setVisible(false);
            return;
          }
          onChange?.(e);
        }}
        onFocus={(e) => {
          if (isMasked) e.target.select();
          onFocus?.(e);
        }}
        // Saved mask is fake text (fixed length). Real keys use password discs.
        type={isMasked ? "text" : visible ? "text" : "password"}
        disabled={disabled}
        autoComplete="new-password"
        spellCheck={false}
        className={inputClassName ?? DEFAULT_INPUT}
      />
      <button
        type="button"
        disabled={disabled || isMasked}
        onClick={() => {
          if (!isMasked) setVisible((v) => !v);
        }}
        aria-label={
          isMasked
            ? "Saved key cannot be shown"
            : visible
              ? "Hide key"
              : "Show key"
        }
        title={
          isMasked
            ? "Saved keys can’t be shown — select the field and paste a new key to replace"
            : visible
              ? "Hide"
              : "Show"
        }
        className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-md p-1.5 text-mist-500 transition-colors hover:bg-white/10 hover:text-mist-100 disabled:pointer-events-none disabled:opacity-40"
      >
        {visible && !isMasked ? (
          <EyeOffIcon className="h-4 w-4" />
        ) : (
          <EyeIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

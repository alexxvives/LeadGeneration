"use client";

import { useState, type InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

const DEFAULT_INPUT =
  "w-full rounded-lg border border-white/10 bg-ink-900/60 py-3 pl-4 pr-11 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Extra classes merged onto the input (use for size variants). */
  inputClassName?: string;
};

/**
 * Password / secret input with show/hide toggle.
 * Secrets are never logged — this only flips the input `type`.
 */
export function PasswordField({
  className,
  inputClassName,
  disabled,
  ...rest
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        {...rest}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={inputClassName ?? DEFAULT_INPUT}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100 disabled:opacity-40"
      >
        {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  );
}

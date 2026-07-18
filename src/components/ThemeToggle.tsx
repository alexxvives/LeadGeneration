"use client";

import { useTheme } from "@/components/ThemeProvider";
import { MoonIcon, SunIcon } from "@/components/icons";

/**
 * Compact light/dark toggle. Palette lives in globals.css (`data-theme`).
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Dark" : "Light"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-mist-300 transition-colors hover:border-aurora-400/40 hover:text-aurora-300 ${className}`}
    >
      {isLight ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
    </button>
  );
}

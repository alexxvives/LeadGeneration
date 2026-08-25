"use client";

import { useTheme } from "@/components/ThemeProvider";
import { MoonIcon } from "@/components/lucide-animated/moon";
import { SunIcon } from "@/components/lucide-animated/sun";

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
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-700 bg-ink-900/80 text-mist-300 shadow-sm backdrop-blur-md transition-colors hover:border-aurora-400/40 hover:text-aurora-300 ${className}`}
    >
      {isLight ? (
        <MoonIcon size={16} className="flex" aria-hidden />
      ) : (
        <SunIcon size={16} className="flex" aria-hidden />
      )}
    </button>
  );
}

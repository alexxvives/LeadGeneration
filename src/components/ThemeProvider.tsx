"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  THEME_STORAGE_KEY,
  isThemeId,
  isStudioPath,
  type ThemeId,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Theme preference is stored globally, but light palette only applies inside
 * the studio (`/app`). Marketing pages always render dark.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const onStudio = isStudioPath(pathname);
  const [pref, setPref] = useState<ThemeId>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const initial: ThemeId = isThemeId(stored) ? stored : "dark";
    setPref(initial);
  }, []);

  useEffect(() => {
    applyTheme(onStudio ? pref : "dark");
  }, [onStudio, pref]);

  const setTheme = useCallback(
    (t: ThemeId) => {
      setPref(t);
      localStorage.setItem(THEME_STORAGE_KEY, t);
      if (onStudio) applyTheme(t);
    },
    [onStudio],
  );

  const toggleTheme = useCallback(() => {
    setTheme(pref === "dark" ? "light" : "dark");
  }, [setTheme, pref]);

  const theme: ThemeId = onStudio ? pref : "dark";

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark",
      setTheme: () => undefined,
      toggleTheme: () => undefined,
    };
  }
  return ctx;
}

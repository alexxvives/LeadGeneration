/**
 * Theme palette — single place to retune dark/light.
 * CSS variables in globals.css mirror these; toggle sets `data-theme` on <html>.
 * Light theme only applies inside the studio (`/app`); marketing stays dark.
 */

export type ThemeId = "dark" | "light";

export const THEME_STORAGE_KEY = "hermes-theme";

export function isThemeId(v: unknown): v is ThemeId {
  return v === "dark" || v === "light";
}

/** Studio routes may use the stored light/dark preference. */
export function isStudioPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

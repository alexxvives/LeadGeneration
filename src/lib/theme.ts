/**
 * Theme palette — single place to retune dark/light.
 * CSS variables in globals.css mirror these; toggle sets `data-theme` on <html>.
 * Light theme only applies inside the studio (`/app`); marketing stays dark.
 * Studio default is light when the user has not stored a preference.
 */

export type ThemeId = "dark" | "light";

export const THEME_STORAGE_KEY = "hermes-theme";
export const DEFAULT_STUDIO_THEME: ThemeId = "light";

export function isThemeId(v: unknown): v is ThemeId {
  return v === "dark" || v === "light";
}

/** Studio routes may use the stored light/dark preference. */
export function isStudioPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

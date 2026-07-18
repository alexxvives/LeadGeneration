/**
 * Theme palette — single place to retune dark/light.
 * CSS variables in globals.css mirror these; toggle sets `data-theme` on <html>.
 */

export type ThemeId = "dark" | "light";

export const THEME_STORAGE_KEY = "hermes-theme";

export function isThemeId(v: unknown): v is ThemeId {
  return v === "dark" || v === "light";
}

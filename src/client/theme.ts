/**
 * Light / dark / system theme.
 *
 * The CSS only knows two states: `:root` (light) and `:root[data-theme="dark"]`.
 * "system" is resolved in JS, so `data-theme` is always "light" or "dark" once a script has run:
 * - THEME_INIT_SCRIPT runs inline in <head> before first paint (no flash of the wrong theme) and
 *   keeps one matchMedia listener so "system" follows OS changes live.
 * - The helpers below are used by the toggle button after the app has loaded.
 *
 * This file is the single source for the init script: src/app/layout.tsx and scripts/build-demo.mjs
 * both read THEME_INIT_SCRIPT from here. Keep it free of imports so the demo build can bundle it alone.
 */

export const THEME_STORAGE_KEY = "refurbops-theme";

/** Cycle order of the toggle button. */
export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Anything that is not a known mode (missing, tampered, old format) means "system". */
export function parseThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
}

export function resolveTheme(mode: ThemeMode, osPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") return osPrefersDark ? "dark" : "light";
  return mode;
}

/** localStorage can throw (private mode, blocked storage): fall back to "system". */
export function loadThemeMode(): ThemeMode {
  try {
    return parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Not persisted; the choice still applies until the page is reloaded.
  }
}

function osPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** Set data-theme for a mode. OS changes while in "system" are handled by the init script's listener. */
export function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(mode, osPrefersDark()));
}

/**
 * Inline <head> script, plain ES5 so it runs before any bundle. It mirrors parseThemeMode/resolveTheme
 * (tests/theme.test.ts runs it against the same cases). The change listener re-reads the stored mode,
 * so it stays correct after the toggle switches modes without needing to be re-registered.
 */
export const THEME_INIT_SCRIPT = `(function () {
  var root = document.documentElement, mq = null;
  function mode() {
    try {
      var v = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      return v === "light" || v === "dark" ? v : "system";
    } catch (e) {
      return "system";
    }
  }
  function apply() {
    var m = mode();
    var dark = m === "dark" || (m === "system" && !!mq && mq.matches);
    root.setAttribute("data-theme", dark ? "dark" : "light");
  }
  try { mq = window.matchMedia(${JSON.stringify(DARK_QUERY)}); } catch (e) {}
  apply();
  if (mq) {
    var onChange = function () { if (mode() === "system") apply(); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();`;

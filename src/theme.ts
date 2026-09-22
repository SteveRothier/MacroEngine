export type ThemeMode = "light" | "dark";
export type ColorScheme = "light" | "dark";

const STORAGE_KEY = "caster-theme";
const LEGACY_STORAGE_KEY = "macroengine-theme";

export function resolvedColorScheme(theme: ThemeMode): ColorScheme {
  return theme;
}

export function readStoredTheme(): ThemeMode {
  try {
    const v =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    const normalized = normalizeTheme(v);
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, normalized);
    }
    return normalized;
  } catch {
    /* ignore */
  }
  return "dark";
}

/** Applies theme to the DOM. localStorage is a boot cache; settings.json is source of truth. */
export function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = resolvedColorScheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Coerce unknown / legacy `"system"` values to a concrete theme (default dark). */
export function normalizeTheme(value: unknown): ThemeMode {
  if (value === "light") return "light";
  if (value === "dark" || value === "system") return "dark";
  return "dark";
}

export function cycleTheme(theme: ThemeMode): ThemeMode {
  return theme === "light" ? "dark" : "light";
}

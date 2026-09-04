export type ThemeMode = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

const STORAGE_KEY = "caster-theme";
const LEGACY_STORAGE_KEY = "macroengine-theme";

export function resolvedColorScheme(theme: ThemeMode): ColorScheme {
  if (theme !== "system") return theme;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function readStoredTheme(): ThemeMode {
  try {
    const v =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (v === "dark" || v === "light" || v === "system") {
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, v);
      }
      return v;
    }
  } catch {
    /* ignore */
  }
  return "light";
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

export function normalizeTheme(value: unknown): ThemeMode {
  if (value === "dark" || value === "light" || value === "system") return value;
  return "light";
}

export function cycleTheme(theme: ThemeMode): ThemeMode {
  if (theme === "light") return "dark";
  if (theme === "dark") return "system";
  return "light";
}

export function subscribeSystemTheme(
  theme: ThemeMode,
  onChange: () => void,
): () => void {
  if (theme !== "system" || typeof window === "undefined") {
    return () => undefined;
  }
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

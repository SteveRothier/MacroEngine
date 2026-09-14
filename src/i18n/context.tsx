import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { UiLocale } from "../settings/settingsTypes";
import { resolveLocale, type AppLocale, type InterpVars } from "./types";
import { tStatic, type MessageKey, type TFunction } from "./t";

type LocaleContextValue = {
  preference: UiLocale;
  locale: AppLocale;
  t: TFunction;
  setPreference: (pref: UiLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type ProviderProps = {
  preference: UiLocale;
  onPreferenceChange?: (pref: UiLocale) => void;
  children: ReactNode;
};

export function LocaleProvider({
  preference,
  onPreferenceChange,
  children,
}: ProviderProps) {
  const locale = useMemo(() => resolveLocale(preference), [preference]);
  const setPreference = useCallback(
    (pref: UiLocale) => {
      onPreferenceChange?.(pref);
    },
    [onPreferenceChange],
  );
  const t = useCallback<TFunction>(
    (key: MessageKey | string, vars?: InterpVars) => tStatic(locale, key, vars),
    [locale],
  );
  const value = useMemo(
    () => ({ preference, locale, t, setPreference }),
    [preference, locale, t, setPreference],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

export function useT(): TFunction {
  return useLocale().t;
}

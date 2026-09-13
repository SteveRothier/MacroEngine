import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../clicker/clickerTypes";
import {
  type AutomationFilter,
  type DisplayOptions,
} from "./types";
import {
  mergeAccueilPrefs,
  type AccueilPrefs,
} from "../settings/settingsTypes";

function displayFromAccueil(prefs: AccueilPrefs): DisplayOptions {
  return {
    sortBy: prefs.defaultSortBy,
    sortDir: prefs.defaultSortDir,
  };
}

export function useAutomationsPageState(accueilPrefs?: AccueilPrefs | null) {
  const prefs = mergeAccueilPrefs(accueilPrefs);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AutomationFilter>(prefs.defaultFilter);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [display, setDisplay] = useState<DisplayOptions>(() =>
    displayFromAccueil(prefs),
  );
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void invoke<AppSettings>("get_settings")
      .then((s) => {
        if (cancelled) return;
        const a = mergeAccueilPrefs(s.accueil);
        setFilter(a.defaultFilter);
        setDisplay(displayFromAccueil(a));
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  /** Apply defaults when settings Accueil section changes (without wiping user mid-session sort). */
  function applyAccueilDefaults(next: AccueilPrefs) {
    setFilter(next.defaultFilter);
    setDisplay(displayFromAccueil(next));
  }

  return {
    query,
    setQuery,
    filter,
    setFilter,
    folderKey,
    setFolderKey,
    display,
    setDisplay,
    focusKey,
    setFocusKey,
    applyAccueilDefaults,
  };
}

import { useState } from "react";
import {
  type AutomationFilter,
  type AutomationKindFilter,
  type DisplayOptions,
} from "./types";
import { mergeAccueilPrefs } from "../settings/settingsTypes";

const defaults = mergeAccueilPrefs();

export function useAutomationsPageState() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AutomationFilter>(defaults.defaultFilter);
  const [kindFilter, setKindFilter] = useState<AutomationKindFilter>("all");
  const [display, setDisplay] = useState<DisplayOptions>(() => ({
    sortBy: defaults.defaultSortBy,
    sortDir: defaults.defaultSortDir,
  }));
  const [focusKey, setFocusKey] = useState<string | null>(null);

  return {
    query,
    setQuery,
    filter,
    setFilter,
    kindFilter,
    setKindFilter,
    display,
    setDisplay,
    focusKey,
    setFocusKey,
  };
}

import { useState } from "react";
import {
  type AutomationFilter,
  type DisplayOptions,
} from "./types";
import { mergeAccueilPrefs } from "../settings/settingsTypes";

const defaults = mergeAccueilPrefs();

export function useAutomationsPageState() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AutomationFilter>(defaults.defaultFilter);
  const [folderKey, setFolderKey] = useState<string | null>(null);
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
    folderKey,
    setFolderKey,
    display,
    setDisplay,
    focusKey,
    setFocusKey,
  };
}

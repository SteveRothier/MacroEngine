import { useState } from "react";
import {
  DEFAULT_DISPLAY,
  type AutomationFilter,
  type DisplayOptions,
} from "./types";

export function useAutomationsPageState() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AutomationFilter>("all");
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY);
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

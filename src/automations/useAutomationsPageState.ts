import { useState } from "react";
import { DEFAULT_DISPLAY, type AutomationFilter, type DisplayOptions } from "./types";

export function useAutomationsPageState() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AutomationFilter>("all");
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY);
  return { query, setQuery, filter, setFilter, display, setDisplay };
}

export type ProcessFilterMode = "allow" | "deny";

export type ProcessFilter = {
  enabled: boolean;
  mode: ProcessFilterMode;
  names: string[];
};

/** Saved named allow/deny list (global settings). */
export type ProcessFilterPreset = {
  id: string;
  name: string;
  mode: ProcessFilterMode;
  names: string[];
};

/** Per-document override of the global filter (macros + clicker presets). */
export type ProcessFilterScopeMode = "inherit" | "off" | "local";

export const DEFAULT_PROCESS_FILTER: ProcessFilter = {
  enabled: false,
  mode: "deny",
  names: [],
};

export function normalizeExeName(s: string): string {
  const t = s.trim().replace(/\\/g, "/");
  const base = t.split("/").pop() ?? t;
  return base.toLowerCase();
}

/** Label without trailing `.exe` (storage / matching keep the full name). */
export function displayExeName(s: string): string {
  const base = normalizeExeName(s);
  return base.endsWith(".exe") ? base.slice(0, -4) : base;
}

/** Whether the process filter allows execution for the foreground exe. */
export function processFilterAllows(
  filter: ProcessFilter,
  foregroundExe: string | null | undefined,
): boolean {
  if (!filter.enabled) return true;
  const listed = filter.names.map(normalizeExeName).filter((n) => n.length > 0);
  if (listed.length === 0) {
    return filter.mode === "deny";
  }
  const exe = foregroundExe ? normalizeExeName(foregroundExe) : "";
  if (!exe) {
    return filter.mode === "deny";
  }
  const hit = listed.includes(exe);
  return filter.mode === "allow" ? hit : !hit;
}

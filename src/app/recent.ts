import type { AutomationRow } from "../automations/types";

export type RecentAutomation = {
  id: string;
  kind: "macro" | "clicker";
  label: string;
};

export type LastStudio = {
  id: string;
  kind: "macro" | "clicker";
};

const RECENT_KEY = "caster-v2-recent";
const LEGACY_RECENT_KEY = "macroengine-v2-recent";
const LAST_STUDIO_KEY = "caster-v2-last-studio";
const LEGACY_LAST_STUDIO_KEY = "macroengine-v2-last-studio";
const MAX_RECENT = 8;

function readJsonKey(key: string, legacyKey: string): string | null {
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
    if (raw && !localStorage.getItem(key)) {
      localStorage.setItem(key, raw);
    }
    return raw;
  } catch {
    return null;
  }
}

export function loadRecent(): RecentAutomation[] {
  try {
    const raw = readJsonKey(RECENT_KEY, LEGACY_RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentAutomation[];
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentAutomation): RecentAutomation[] {
  const prev = loadRecent().filter((r) => r.id !== entry.id);
  const next = [entry, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export function loadLastStudio(): LastStudio | null {
  try {
    const raw = readJsonKey(LAST_STUDIO_KEY, LEGACY_LAST_STUDIO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastStudio;
    if (
      (parsed.kind === "macro" || parsed.kind === "clicker") &&
      typeof parsed.id === "string" &&
      parsed.id.trim()
    ) {
      return { kind: parsed.kind, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLastStudio(entry: LastStudio): void {
  try {
    localStorage.setItem(LAST_STUDIO_KEY, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

export function clearLastStudio(): void {
  try {
    localStorage.removeItem(LAST_STUDIO_KEY);
  } catch {
    /* ignore */
  }
}

export function automationId(row: AutomationRow): string {
  return `${row.kind}:${row.id}`;
}

export function parseAutomationId(
  composite: string,
): { kind: "macro" | "clicker"; id: string } | null {
  const i = composite.indexOf(":");
  if (i < 1) return null;
  const kind = composite.slice(0, i);
  if (kind !== "macro" && kind !== "clicker") return null;
  return { kind, id: composite.slice(i + 1) };
}

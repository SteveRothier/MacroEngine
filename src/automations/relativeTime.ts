import type { RecentEntry } from "../quickAccess";
import type { AutomationRow } from "./types";

/** Relative French label for a unix-ms timestamp. */
export function formatRelativeRunFr(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return "—";
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 45) return "à l’instant";
  if (sec < 3600) {
    const m = Math.max(1, Math.floor(sec / 60));
    return m === 1 ? "il y a 1 min" : `il y a ${m} min`;
  }
  if (sec < 86400) {
    const h = Math.max(1, Math.floor(sec / 3600));
    return h === 1 ? "il y a 1 h" : `il y a ${h} h`;
  }
  const d = Math.floor(sec / 86400);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} j`;
  return new Date(at).toLocaleDateString("fr-FR");
}

export function lastRunLabelMap(recent: RecentEntry[]): Map<string, string> {
  const now = Date.now();
  const map = new Map<string, string>();
  for (const r of recent) {
    const key = `${r.kind}:${r.id}`;
    if (map.has(key)) continue;
    map.set(key, formatRelativeRunFr(r.at, now));
  }
  return map;
}

export function rowKey(kind: AutomationRow["kind"], id: string): string {
  return `${kind}:${id}`;
}

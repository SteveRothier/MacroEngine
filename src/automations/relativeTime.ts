import type { RecentEntry, RecentRunStatus } from "../quickAccess";
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

export function formatDurationFr(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const sec = ms / 1000;
  if (sec < 60) {
    const rounded = sec < 10 ? sec.toFixed(1) : String(Math.round(sec));
    return `${rounded.replace(".", ",")} s`;
  }
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m} min ${s} s` : `${m} min`;
}

export function recentStatusLabelFr(status: RecentRunStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "error":
      return "Erreur";
    case "cancelled":
      return "Annulé";
  }
}

/** Compact Accueil cell: relative · duration · status (when known). */
export function formatLastRunSummary(entry: RecentEntry, now = Date.now()): string {
  const parts = [formatRelativeRunFr(entry.at, now)];
  if (entry.durationMs != null && entry.durationMs >= 0) {
    const d = formatDurationFr(entry.durationMs);
    if (d) parts.push(d);
  }
  if (entry.status) parts.push(recentStatusLabelFr(entry.status));
  return parts.join(" · ");
}

/** Tooltip: statut · durée · relative. */
export function formatLastRunTooltip(entry: RecentEntry, now = Date.now()): string {
  const parts: string[] = [];
  if (entry.status) parts.push(recentStatusLabelFr(entry.status));
  if (entry.durationMs != null && entry.durationMs >= 0) {
    const d = formatDurationFr(entry.durationMs);
    if (d) parts.push(d);
  }
  parts.push(formatRelativeRunFr(entry.at, now));
  return parts.join(" · ");
}

export function lastRunLabelMap(recent: RecentEntry[]): Map<string, string> {
  const now = Date.now();
  const map = new Map<string, string>();
  for (const r of recent) {
    const key = `${r.kind}:${r.id}`;
    if (map.has(key)) continue;
    map.set(key, formatLastRunSummary(r, now));
  }
  return map;
}

export function lastRunTooltipMap(recent: RecentEntry[]): Map<string, string> {
  const now = Date.now();
  const map = new Map<string, string>();
  for (const r of recent) {
    const key = `${r.kind}:${r.id}`;
    if (map.has(key)) continue;
    map.set(key, formatLastRunTooltip(r, now));
  }
  return map;
}

export function rowKey(kind: AutomationRow["kind"], id: string): string {
  return `${kind}:${id}`;
}

import type { RecentEntry, RecentRunStatus } from "../quickAccess";
import type { AppLocale, TFunction } from "../i18n";
import type { AutomationRow } from "./types";

function localeTag(locale: AppLocale): string {
  return locale === "en" ? "en-US" : "fr-FR";
}

function decimalSep(locale: AppLocale): string {
  return locale === "en" ? "." : ",";
}

/** Relative label for a unix-ms timestamp. */
export function formatRelativeRun(
  at: number,
  t: TFunction,
  now = Date.now(),
  locale: AppLocale = "fr",
): string {
  if (!Number.isFinite(at) || at <= 0) return t("common.empty");
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 45) return t("automations.relative.justNow");
  if (sec < 3600) {
    const m = Math.max(1, Math.floor(sec / 60));
    return m === 1
      ? t("automations.relative.minutesOne")
      : t("automations.relative.minutes", { count: m });
  }
  if (sec < 86400) {
    const h = Math.max(1, Math.floor(sec / 3600));
    return h === 1
      ? t("automations.relative.hoursOne")
      : t("automations.relative.hours", { count: h });
  }
  const d = Math.floor(sec / 86400);
  if (d === 1) return t("automations.relative.yesterday");
  if (d < 7) return t("automations.relative.days", { count: d });
  return new Date(at).toLocaleDateString(localeTag(locale));
}

export function formatDuration(
  ms: number,
  t: TFunction,
  locale: AppLocale = "fr",
): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) {
    return t("automations.relative.durationMs", { ms: Math.round(ms) });
  }
  const sec = ms / 1000;
  if (sec < 60) {
    const rounded = sec < 10 ? sec.toFixed(1) : String(Math.round(sec));
    const sep = decimalSep(locale);
    return t("automations.relative.durationSec", {
      sec: rounded.replace(".", sep),
    });
  }
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0
    ? t("automations.relative.durationMinSec", { m, s })
    : t("automations.relative.durationMin", { m });
}

export function recentStatusLabel(
  status: RecentRunStatus,
  t: TFunction,
): string {
  switch (status) {
    case "ok":
      return t("automations.relative.statusOk");
    case "error":
      return t("automations.relative.statusError");
    case "cancelled":
      return t("automations.relative.statusCancelled");
  }
}

/** Compact Accueil cell: relative · duration · status (when known). */
export function formatLastRunSummary(
  entry: RecentEntry,
  t: TFunction,
  now = Date.now(),
  locale: AppLocale = "fr",
): string {
  const parts = [formatRelativeRun(entry.at, t, now, locale)];
  if (entry.durationMs != null && entry.durationMs >= 0) {
    const d = formatDuration(entry.durationMs, t, locale);
    if (d) parts.push(d);
  }
  if (entry.status) parts.push(recentStatusLabel(entry.status, t));
  return parts.join(" · ");
}

/** Tooltip: statut · durée · relative. */
export function formatLastRunTooltip(
  entry: RecentEntry,
  t: TFunction,
  now = Date.now(),
  locale: AppLocale = "fr",
): string {
  const parts: string[] = [];
  if (entry.status) parts.push(recentStatusLabel(entry.status, t));
  if (entry.durationMs != null && entry.durationMs >= 0) {
    const d = formatDuration(entry.durationMs, t, locale);
    if (d) parts.push(d);
  }
  parts.push(formatRelativeRun(entry.at, t, now, locale));
  return parts.join(" · ");
}

export function lastRunLabelMap(
  recent: RecentEntry[],
  t: TFunction,
  locale: AppLocale = "fr",
): Map<string, string> {
  const now = Date.now();
  const map = new Map<string, string>();
  for (const r of recent) {
    const key = `${r.kind}:${r.id}`;
    if (map.has(key)) continue;
    map.set(key, formatLastRunSummary(r, t, now, locale));
  }
  return map;
}

export function lastRunTooltipMap(
  recent: RecentEntry[],
  t: TFunction,
  locale: AppLocale = "fr",
): Map<string, string> {
  const now = Date.now();
  const map = new Map<string, string>();
  for (const r of recent) {
    const key = `${r.kind}:${r.id}`;
    if (map.has(key)) continue;
    map.set(key, formatLastRunTooltip(r, t, now, locale));
  }
  return map;
}

export function rowKey(kind: AutomationRow["kind"], id: string): string {
  return `${kind}:${id}`;
}

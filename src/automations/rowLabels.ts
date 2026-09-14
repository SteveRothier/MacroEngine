import type { TFunction } from "../i18n";
import type { AutomationRow, AutomationStatus } from "./types";

export function kindTooltip(row: AutomationRow, t: TFunction): string {
  const kind =
    row.kind === "macro"
      ? t("automations.row.kindTipMacro")
      : row.kind === "clicker"
        ? t("automations.row.kindTipClicker")
        : t("automations.row.kindTipScript");
  if (row.folderLabel && row.folderLabel !== t("common.empty")) {
    return t("automations.row.kindTipWithFolder", {
      kind,
      folder: row.folderLabel,
    });
  }
  return kind;
}

export function metaTooltip(row: AutomationRow, t: TFunction): string {
  const empty = t("common.empty");
  const parts = [
    row.triggerLabel,
    row.folderLabel !== empty ? row.folderLabel : null,
    row.lastRunLabel,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function statusTooltip(
  status: AutomationStatus,
  t: TFunction,
): string {
  switch (status) {
    case "attention":
      return t("automations.status.tipAttention");
    case "locked":
      return t("automations.status.tipLocked");
    case "failed":
      return t("automations.status.tipFailed");
    case "healthy":
      return t("automations.status.tipHealthy");
  }
}

export function favoriteTooltip(favorite: boolean, t: TFunction): string {
  return favorite
    ? t("automations.row.removeFavorite")
    : t("automations.row.addFavorite");
}

export function sortByLabel(
  sortBy: "name" | "type" | "status",
  t: TFunction,
): string {
  switch (sortBy) {
    case "name":
      return t("automations.row.sortName");
    case "type":
      return t("automations.row.sortType");
    case "status":
      return t("automations.row.sortStatus");
  }
}

export function filterPillTooltip(
  filter: "all" | "favorites" | "recent" | "scripts",
  t: TFunction,
): string {
  switch (filter) {
    case "all":
      return t("automations.filter.tipAll");
    case "favorites":
      return t("automations.filter.tipFavorites");
    case "recent":
      return t("automations.filter.tipRecent");
    case "scripts":
      return t("automations.filter.tipScripts");
  }
}

/** Secondary line under the name (Linear-style) — never repeats the type badge. */
export function rowSubtitle(
  row: AutomationRow,
  t: TFunction,
  opts?: { running?: boolean },
): string | null {
  if (opts?.running) return t("common.running");
  const empty = t("common.empty");
  if (row.kind === "script") {
    const n = row.permLabels?.length ?? 0;
    if (n > 0) return t("automations.row.permAccess", { count: n });
    if (row.lastRunLabel !== empty) return row.lastRunLabel;
    return null;
  }
  const parts: string[] = [];
  if (row.meta?.trim()) parts.push(row.meta.trim());
  if (row.folderLabel && row.folderLabel !== empty) parts.push(row.folderLabel);
  if (parts.length > 0) return parts.join(" · ");
  if (row.lastRunLabel !== empty) return row.lastRunLabel;
  if (
    row.triggerLabel &&
    row.triggerLabel !== t("automations.trigger.manual")
  ) {
    return row.triggerLabel;
  }
  return null;
}

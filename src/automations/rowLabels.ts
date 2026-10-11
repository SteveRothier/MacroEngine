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
    row.lastRunLabel !== empty ? row.lastRunLabel : null,
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
  sortBy: "name" | "type" | "status" | "lastRun" | "order",
  t: TFunction,
): string {
  switch (sortBy) {
    case "name":
      return t("automations.row.sortName");
    case "type":
      return t("automations.row.sortType");
    case "status":
      return t("automations.row.sortStatus");
    case "lastRun":
      return t("automations.row.sortLastRun");
    case "order":
      return t("automations.columns.order");
  }
}

export function filterPillTooltip(
  filter: "all" | "favorites" | "recent" | "trash",
  t: TFunction,
): string {
  switch (filter) {
    case "all":
      return t("automations.filter.tipAll");
    case "favorites":
      return t("automations.filter.tipFavorites");
    case "recent":
      return t("automations.filter.tipRecent");
    case "trash":
      return t("automations.filter.tipTrash");
  }
}

/** True when the trigger column should show a label (hide plain Manuel). */
export function showTriggerLabel(row: AutomationRow, t: TFunction): boolean {
  const manual = t("automations.trigger.manual");
  return Boolean(row.triggerLabel && row.triggerLabel !== manual);
}

/** Wide-layout Infos column: meta (+ script perm count). */
export function rowInfoLabel(row: AutomationRow, t: TFunction): string | null {
  const parts: string[] = [];
  if (row.meta?.trim()) parts.push(row.meta.trim());
  if (row.kind === "script") {
    const n = row.permLabels?.length ?? 0;
    if (n > 0) parts.push(t("automations.row.permAccess", { count: n }));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type RowSubtitleMode = "wide" | "narrow";

/**
 * Secondary line under the name.
 * - wide: folder only when includeFolder (Infos / hotkey / lastRun are columns)
 * - narrow: meta · folder? · trigger? · lastRun? (columns collapsed)
 */
export function rowSubtitle(
  row: AutomationRow,
  t: TFunction,
  opts?: {
    running?: boolean;
    includeFolder?: boolean;
    mode?: RowSubtitleMode;
  },
): string | null {
  if (opts?.running) return t("common.running");
  const empty = t("common.empty");
  const mode = opts?.mode ?? "narrow";

  if (mode === "wide") {
    if (
      opts?.includeFolder &&
      row.folderLabel &&
      row.folderLabel !== empty
    ) {
      return row.folderLabel;
    }
    return null;
  }

  const parts: string[] = [];
  const info = rowInfoLabel(row, t);
  if (info) parts.push(info);

  if (
    opts?.includeFolder &&
    row.folderLabel &&
    row.folderLabel !== empty
  ) {
    parts.push(row.folderLabel);
  }

  if (showTriggerLabel(row, t) && row.triggerLabel) {
    parts.push(row.triggerLabel);
  }

  if (row.lastRunLabel && row.lastRunLabel !== empty) {
    parts.push(row.lastRunLabel);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

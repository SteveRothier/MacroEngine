import type { TFunction } from "../i18n";
import type { StatusKind } from "../ui/v2";
import type { LibraryKind } from "../library/types";

export type AutomationKind = LibraryKind;

export type AutomationStatus = "healthy" | "attention" | "locked" | "failed";

export type AutomationRow = {
  id: string;
  name: string;
  kind: AutomationKind;
  triggerLabel: string;
  folderLabel: string;
  folderId: string | null;
  status: AutomationStatus;
  lastRunLabel: string;
  lastRunTooltip?: string;
  favorite: boolean;
  locked: boolean;
  dirty: boolean;
  meta?: string;
  /** Library index order within kind+folder. */
  sortOrder?: number;
  /** Active script permissions (Accueil badge). */
  permLabels?: string[];
};

export function statusToPill(
  status: AutomationStatus,
  t: TFunction,
): {
  kind: StatusKind;
  label: string;
} {
  switch (status) {
    case "healthy":
      return { kind: "healthy", label: t("automations.status.pillOk") };
    case "attention":
      return { kind: "attention", label: t("automations.status.pillModified") };
    case "locked":
      return { kind: "paused", label: t("automations.status.pillLocked") };
    case "failed":
      return { kind: "failed", label: t("automations.status.pillError") };
  }
}

export type DisplayOptions = {
  sortBy: "order" | "name" | "type" | "status";
  sortDir: "asc" | "desc";
};

export type AutomationFilter = "all" | "favorites" | "recent" | "scripts";

/** Folder option for Accueil filter / bulk move (`kind` scopes library index). */
export type AutomationFolderOption = {
  id: string;
  name: string;
  kind: "macro" | "clicker";
};

export function folderOptionKey(
  f: Pick<AutomationFolderOption, "kind" | "id">,
): string {
  return `${f.kind}:${f.id}`;
}

export type FilterCounts = {
  all: number;
  favorites: number;
  recent: number;
  scripts: number;
};

export const DEFAULT_DISPLAY: DisplayOptions = {
  sortBy: "order",
  sortDir: "asc",
};

export const COLLAPSED_SECTIONS_KEY = "caster.accueil.collapsedSections";

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
  favorite: boolean;
  locked: boolean;
  dirty: boolean;
  meta?: string;
  /** Active script permissions (Accueil badge). */
  permLabels?: string[];
};

export function statusToPill(status: AutomationStatus): {
  kind: StatusKind;
  label: string;
} {
  switch (status) {
    case "healthy":
      return { kind: "healthy", label: "OK" };
    case "attention":
      return { kind: "attention", label: "Modifié" };
    case "locked":
      return { kind: "paused", label: "Verrouillé" };
    case "failed":
      return { kind: "failed", label: "Erreur" };
  }
}

export type DisplayOptions = {
  sortBy: "name" | "type" | "status";
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
  sortBy: "name",
  sortDir: "asc",
};

export const COLLAPSED_SECTIONS_KEY = "caster.accueil.collapsedSections";

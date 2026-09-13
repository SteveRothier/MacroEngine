import type { ReactNode } from "react";
import type { MenuItemDef } from "../ui/v2";
import type { AutomationFolderOption, AutomationRow } from "./types";
import { folderOptionKey } from "./types";

export type AutomationRowMenuActions = {
  onOpen: () => void;
  onLaunch: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onToggleFavorite?: () => void;
  onLock?: () => void;
  onUnlock?: () => void;
  onReveal?: () => void;
  /** Folders for « Déplacer vers > » (same kind). Null = Sans dossier. */
  moveFolders?: AutomationFolderOption[];
  onMoveToFolder?: (folder: AutomationFolderOption | null) => void;
  onDelete: () => void;
  icons?: {
    open?: ReactNode;
    launch?: ReactNode;
    rename?: ReactNode;
    duplicate?: ReactNode;
    favorite?: ReactNode;
    lock?: ReactNode;
    unlock?: ReactNode;
    move?: ReactNode;
    reveal?: ReactNode;
    delete?: ReactNode;
  };
};

/** Shared items for Accueil ⋯ menu and context menu. */
export function buildAutomationRowMenuItems(
  row: AutomationRow,
  actions: AutomationRowMenuActions,
): MenuItemDef[] {
  const items: MenuItemDef[] = [
    {
      id: "open",
      label: "Ouvrir",
      icon: actions.icons?.open,
      onSelect: actions.onOpen,
    },
  ];
  if (actions.onRename && !row.locked) {
    items.push({
      id: "rename",
      label: "Renommer",
      icon: actions.icons?.rename,
      onSelect: actions.onRename,
    });
  }
  if (actions.onDuplicate && !row.locked) {
    items.push({
      id: "duplicate",
      label: "Dupliquer",
      icon: actions.icons?.duplicate,
      onSelect: actions.onDuplicate,
    });
  }
  if (row.kind !== "script") {
    items.push({
      id: "launch",
      label: "Lancer",
      icon: actions.icons?.launch,
      onSelect: actions.onLaunch,
    });
  }

  items.push({ id: "sep-mid", label: "", separator: true });

  if (row.kind !== "script") {
    if (actions.onToggleFavorite) {
      items.push({
        id: "favorite",
        label: row.favorite ? "Retirer des favoris" : "Ajouter aux favoris",
        icon: actions.icons?.favorite,
        onSelect: actions.onToggleFavorite,
      });
    }
    if (row.locked && actions.onUnlock) {
      items.push({
        id: "unlock",
        label: "Déverrouiller",
        icon: actions.icons?.unlock,
        onSelect: actions.onUnlock,
      });
    } else if (!row.locked && actions.onLock) {
      items.push({
        id: "lock",
        label: "Verrouiller",
        icon: actions.icons?.lock,
        onSelect: actions.onLock,
      });
    }
    if (actions.onMoveToFolder && !row.locked) {
      const folders = actions.moveFolders ?? [];
      const moveSub: MenuItemDef[] = [
        {
          id: "move-root",
          label: "Sans dossier",
          icon: actions.icons?.move,
          onSelect: () => actions.onMoveToFolder?.(null),
        },
        ...folders.map((f) => ({
          id: `move-${folderOptionKey(f)}`,
          label: f.name,
          icon: actions.icons?.move,
          onSelect: () => actions.onMoveToFolder?.(f),
        })),
      ];
      items.push({
        id: "move",
        label: "Déplacer vers",
        icon: actions.icons?.move,
        submenu: moveSub,
      });
    }
  }

  if (actions.onReveal) {
    items.push({
      id: "reveal",
      label: "Afficher dans l’explorateur",
      icon: actions.icons?.reveal,
      onSelect: actions.onReveal,
    });
  }

  items.push(
    { id: "sep-del", label: "", separator: true },
    {
      id: "delete",
      label:
        row.kind === "macro" || row.kind === "clicker"
          ? "Mettre à la corbeille"
          : "Supprimer",
      icon: actions.icons?.delete,
      danger: true,
      onSelect: actions.onDelete,
    },
  );
  return items;
}

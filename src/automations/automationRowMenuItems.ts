import type { ReactNode } from "react";
import type { TFunction } from "../i18n";
import type { MenuItemDef } from "../ui/shell";
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
  /** Convert to another kind (submenu targets). */
  onConvertTo?: (toKind: AutomationRow["kind"]) => void;
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
  t: TFunction,
  actions: AutomationRowMenuActions,
): MenuItemDef[] {
  const items: MenuItemDef[] = [
    {
      id: "open",
      label: t("common.open"),
      icon: actions.icons?.open,
      onSelect: actions.onOpen,
    },
  ];
  if (actions.onRename && !row.locked) {
    items.push({
      id: "rename",
      label: t("automations.menu.row.rename"),
      icon: actions.icons?.rename,
      onSelect: actions.onRename,
    });
  }
  if (actions.onDuplicate && !row.locked) {
    items.push({
      id: "duplicate",
      label: t("automations.menu.row.duplicate"),
      icon: actions.icons?.duplicate,
      onSelect: actions.onDuplicate,
    });
  }
  if (row.kind !== "script") {
    items.push({
      id: "launch",
      label: t("automations.menu.row.launch"),
      icon: actions.icons?.launch,
      onSelect: actions.onLaunch,
    });
  } else if (!row.isModule) {
    items.push({
      id: "launch",
      label: t("automations.menu.row.execute"),
      icon: actions.icons?.launch,
      onSelect: actions.onLaunch,
    });
  }

  items.push({ id: "sep-mid", label: "", separator: true });

  if (row.kind !== "script") {
    if (actions.onToggleFavorite) {
      items.push({
        id: "favorite",
        label: row.favorite
          ? t("automations.menu.row.removeFavorite")
          : t("automations.menu.row.addFavorite"),
        icon: actions.icons?.favorite,
        onSelect: actions.onToggleFavorite,
      });
    }
  }
  if (row.locked && actions.onUnlock) {
    items.push({
      id: "unlock",
      label: t("automations.menu.row.unlock"),
      icon: actions.icons?.unlock,
      onSelect: actions.onUnlock,
    });
  } else if (!row.locked && actions.onLock) {
    items.push({
      id: "lock",
      label: t("automations.menu.row.lock"),
      icon: actions.icons?.lock,
      onSelect: actions.onLock,
    });
  }
  if (actions.onMoveToFolder && !row.locked) {
    const folders = (actions.moveFolders ?? []).filter(
      (f) => f.id !== row.folderId,
    );
    const moveSub: MenuItemDef[] = [];
    if (row.folderId != null) {
      moveSub.push({
        id: "move-root",
        label: t("automations.menu.row.noFolder"),
        icon: actions.icons?.move,
        onSelect: () => actions.onMoveToFolder?.(null),
      });
    }
    for (const f of folders) {
      moveSub.push({
        id: `move-${folderOptionKey(f)}`,
        label: f.name,
        icon: actions.icons?.move,
        onSelect: () => actions.onMoveToFolder?.(f),
      });
    }
    if (moveSub.length > 0) {
      items.push({
        id: "move",
        label: t("automations.menu.row.moveTo"),
        icon: actions.icons?.move,
        submenu: moveSub,
      });
    }
  }

  if (actions.onReveal) {
    items.push({
      id: "reveal",
      label: t("automations.menu.row.reveal"),
      icon: actions.icons?.reveal,
      onSelect: actions.onReveal,
    });
  }

  if (actions.onConvertTo && !row.locked) {
    const targets =
      row.kind === "script"
        ? (["macro"] as const)
        : row.kind === "macro"
          ? (["script"] as const)
          : (["macro", "script"] as const);
    items.push({
      id: "convert",
      label: t("automations.menu.row.convertTo"),
      submenu: targets.map((to) => ({
        id: `convert-${to}`,
        label: t(`automations.convert.kind.${to}`),
        onSelect: () => actions.onConvertTo?.(to),
      })),
    });
  }

  items.push(
    { id: "sep-del", label: "", separator: true },
    {
      id: "delete",
      label:
        row.kind === "macro" || row.kind === "clicker"
          ? t("automations.menu.row.trash")
          : t("automations.menu.row.delete"),
      icon: actions.icons?.delete,
      danger: true,
      onSelect: actions.onDelete,
    },
  );
  return items;
}

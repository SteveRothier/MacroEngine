import type { TFunction } from "../i18n";
import type { MenuItemDef } from "../ui/shell";
import type { LibraryItemView } from "./types";

export type LibraryItemMenuActions = {
  t: TFunction;
  folders: { id: string; name: string }[];
  trashed: boolean;
  onMove: (folderId: string | null) => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onToggleLock: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDelete?: () => void;
  /** When set, shows convert entries for this item kind. */
  itemKind?: "macro" | "clicker" | "script";
  onConvertTo?: (toKind: "macro" | "clicker" | "script") => void;
};

/** Shared items for LibrarySidebar ⋯ and context menu. */
export function buildLibraryItemMenuItems(
  item: LibraryItemView,
  actions: LibraryItemMenuActions,
): MenuItemDef[] {
  const {
    t,
    folders,
    trashed,
    onMove,
    onDuplicate,
    onRename,
    onToggleLock,
    onTrash,
    onRestore,
    onDelete,
    itemKind,
    onConvertTo,
  } = actions;
  const items: MenuItemDef[] = [];
  if (onRename && !item.locked) {
    items.push({ id: "rename", label: t("library.menu.rename"), onSelect: onRename });
  }
  if (onDuplicate) {
    items.push({
      id: "duplicate",
      label: t("library.menu.duplicate"),
      onSelect: onDuplicate,
    });
  }
  items.push({
    id: "lock",
    label: item.locked ? t("library.menu.unlock") : t("library.menu.lock"),
    onSelect: onToggleLock,
  });
  if (folders.length > 0 && !item.locked) {
    if (item.folderId != null) {
      items.push({
        id: "move-root",
        label: t("library.menu.moveRoot"),
        onSelect: () => onMove(null),
      });
    }
    for (const f of folders) {
      if (f.id === item.folderId) continue;
      items.push({
        id: `move-${f.id}`,
        label: t("library.menu.moveTo", { name: f.name }),
        onSelect: () => onMove(f.id),
      });
    }
  }
  if (onConvertTo && itemKind && !item.locked && !trashed) {
    const targets =
      itemKind === "script"
        ? (["macro"] as const)
        : itemKind === "macro"
          ? (["script"] as const)
          : (["macro", "script"] as const);
    for (const to of targets) {
      items.push({
        id: `convert-${to}`,
        label: t("library.menu.convertTo", { kind: to }),
        onSelect: () => onConvertTo(to),
      });
    }
  }
  if (trashed) {
    items.push({
      id: "restore",
      label: t("library.menu.restore"),
      onSelect: onRestore,
    });
    if (onDelete && !item.locked) {
      items.push({
        id: "delete",
        label: t("library.menu.deleteForever"),
        danger: true,
        onSelect: onDelete,
      });
    }
  } else if (!item.locked) {
    items.push({
      id: "trash",
      label: t("library.menu.trash"),
      danger: true,
      onSelect: onTrash,
    });
  }
  return items;
}

import type { MenuItemDef } from "../ui/shell";
import type { LibraryItemView } from "./types";

export type LibraryItemMenuActions = {
  folders: { id: string; name: string }[];
  trashed: boolean;
  onMove: (folderId: string | null) => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onToggleLock: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDelete?: () => void;
};

/** Shared items for LibrarySidebar ⋯ and context menu. */
export function buildLibraryItemMenuItems(
  item: LibraryItemView,
  actions: LibraryItemMenuActions,
): MenuItemDef[] {
  const {
    folders,
    trashed,
    onMove,
    onDuplicate,
    onRename,
    onToggleLock,
    onTrash,
    onRestore,
    onDelete,
  } = actions;
  const items: MenuItemDef[] = [];
  if (onRename && !item.locked) {
    items.push({ id: "rename", label: "Renommer", onSelect: onRename });
  }
  if (onDuplicate) {
    items.push({ id: "duplicate", label: "Dupliquer", onSelect: onDuplicate });
  }
  items.push({
    id: "lock",
    label: item.locked ? "Déverrouiller" : "Verrouiller",
    onSelect: onToggleLock,
  });
  if (folders.length > 0 && !item.locked) {
    items.push({
      id: "move-root",
      label: "Déplacer → Racine",
      onSelect: () => onMove(null),
    });
    for (const f of folders) {
      items.push({
        id: `move-${f.id}`,
        label: `Déplacer → ${f.name}`,
        onSelect: () => onMove(f.id),
      });
    }
  }
  if (trashed) {
    items.push({ id: "restore", label: "Restaurer", onSelect: onRestore });
    if (onDelete && !item.locked) {
      items.push({
        id: "delete",
        label: "Supprimer définitivement",
        danger: true,
        onSelect: onDelete,
      });
    }
  } else if (!item.locked) {
    items.push({
      id: "trash",
      label: "Mettre à la corbeille",
      danger: true,
      onSelect: onTrash,
    });
  }
  return items;
}

import type { AutomationFolderOption } from "../automations/types";
import { sortFolders } from "./libTree";

const MAX_FOLDER_DEPTH = 3;

/** Ancestor chain length for `folderId` (root child → 1). */
export function folderDepth(
  folders: AutomationFolderOption[],
  folderId: string | null,
): number {
  let depth = 0;
  let cur = folderId;
  let guard = 0;
  while (cur) {
    depth += 1;
    guard += 1;
    if (guard > 32) break;
    cur = folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  return depth;
}

/** Deepest descendant depth below `folderId` (leaf → 0). */
export function folderSubtreeHeight(
  folders: AutomationFolderOption[],
  folderId: string,
): number {
  const kids = folders.filter((f) => (f.parentId ?? null) === folderId);
  if (kids.length === 0) return 0;
  let max = 0;
  for (const k of kids) {
    max = Math.max(max, 1 + folderSubtreeHeight(folders, k.id));
  }
  return max;
}

export function isFolderDescendant(
  folders: AutomationFolderOption[],
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  let cur: string | null = maybeDescendantId;
  let guard = 0;
  while (cur) {
    if (cur === ancestorId) return true;
    guard += 1;
    if (guard > 32) break;
    cur = folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  return false;
}

/** True if nesting `draggedId` under `newParentId` stays within depth cap. */
export function canNestFolder(
  folders: AutomationFolderOption[],
  draggedId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === draggedId) return false;
  if (
    newParentId != null &&
    isFolderDescendant(folders, draggedId, newParentId)
  ) {
    return false;
  }
  const parentDepth = folderDepth(folders, newParentId);
  const subtree = folderSubtreeHeight(folders, draggedId);
  // New folder depth = parentDepth + 1; deepest leaf = that + subtree.
  return parentDepth + 1 + subtree <= MAX_FOLDER_DEPTH;
}

/**
 * Full folder id order for `reorder_library_folders_cmd` after moving
 * `draggedId` under `newParentId`, inserted before `beforeFolderId` (or end).
 */
export function computeFolderReorderIds(
  folders: AutomationFolderOption[],
  draggedId: string,
  newParentId: string | null,
  beforeFolderId: string | null,
): string[] | null {
  if (!folders.some((f) => f.id === draggedId)) return null;
  if (!canNestFolder(folders, draggedId, newParentId)) return null;

  const updated = folders.map((f) =>
    f.id === draggedId ? { ...f, parentId: newParentId } : { ...f },
  );
  const ordered: string[] = [];

  function walk(parent: string | null) {
    let siblings = sortFolders(
      updated.filter((f) => (f.parentId ?? null) === parent),
    );
    if (parent === newParentId) {
      siblings = siblings.filter((f) => f.id !== draggedId);
      const dragged = updated.find((f) => f.id === draggedId);
      if (!dragged) return;
      let at =
        beforeFolderId == null
          ? siblings.length
          : siblings.findIndex((f) => f.id === beforeFolderId);
      if (at < 0) at = siblings.length;
      siblings.splice(at, 0, dragged);
    }
    for (const s of siblings) {
      ordered.push(s.id);
      walk(s.id);
    }
  }

  walk(null);
  if (ordered.length !== folders.length) return null;
  return ordered;
}

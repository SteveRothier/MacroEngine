import type { AutomationFolderOption, AutomationRow } from "../automations/types";
import { canNestFolder, isFolderDescendant } from "./libFolderOrder";
import {
  folderNavKey,
  rowDomKey,
  sortFolders,
  sortLibRows,
  UNFILED_ID,
} from "./libTree";

export type LibDropIndicator = {
  key: string;
  edge: "before" | "after";
};

export type ItemDropHit = {
  mode: "item";
  targetId: string;
  beforeId: string | null;
  beforeKind: AutomationRow["kind"] | null;
  indicator: LibDropIndicator | null;
  cancel?: boolean;
};

export type FolderDropHit = {
  mode: "folder";
  /** Nest into this folder (header chrome); mutually exclusive with reorder. */
  nestIntoId: string | null;
  parentId: string | null;
  beforeFolderId: string | null;
  indicator: LibDropIndicator | null;
  cancel?: boolean;
};

export type DropHit = ItemDropHit | FolderDropHit;

function cancelItemHit(): ItemDropHit {
  return {
    mode: "item",
    targetId: UNFILED_ID,
    beforeId: null,
    beforeKind: null,
    indicator: null,
    cancel: true,
  };
}

function cancelFolderHit(): FolderDropHit {
  return {
    mode: "folder",
    nestIntoId: null,
    parentId: null,
    beforeFolderId: null,
    indicator: null,
    cancel: true,
  };
}

export function sortFolderRows(
  rows: AutomationRow[],
  folderId: string | null,
): AutomationRow[] {
  return sortLibRows(
    rows.filter((r) => (r.folderId ?? null) === folderId),
  );
}

export function sortSiblingFolders(
  folders: AutomationFolderOption[],
  parentId: string | null,
): AutomationFolderOption[] {
  return sortFolders(folders.filter((f) => (f.parentId ?? null) === parentId));
}

function visualBeforeTarget(
  folderId: string | null,
  visualBeforeKey: string | null,
  rows: AutomationRow[],
  draggingKey: string,
): { beforeId: string | null; beforeKind: AutomationRow["kind"] | null } {
  if (!visualBeforeKey) return { beforeId: null, beforeKind: null };
  const visual = sortFolderRows(rows, folderId).filter(
    (r) => rowDomKey(r) !== draggingKey,
  );
  const target = visual.find((r) => rowDomKey(r) === visualBeforeKey);
  if (!target) return { beforeId: null, beforeKind: null };
  return { beforeId: target.id, beforeKind: target.kind };
}

function hitFromItem(
  itemEl: HTMLElement,
  clientY: number,
  draggingKey: string,
  rows: AutomationRow[],
): ItemDropHit | null {
  const key = itemEl.dataset.navKey ?? null;
  if (!key) return null;
  if (key === draggingKey) return cancelItemHit();
  const target = rows.find((r) => rowDomKey(r) === key);
  if (!target) return null;

  const folderId = target.folderId ?? null;
  const targetId = folderId ?? UNFILED_ID;
  const visual = sortFolderRows(rows, folderId).filter(
    (r) => rowDomKey(r) !== draggingKey,
  );
  const idx = visual.findIndex((r) => rowDomKey(r) === key);
  if (idx < 0) return null;

  const rect = itemEl.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;

  if (!after) {
    const before = visualBeforeTarget(folderId, key, rows, draggingKey);
    return {
      mode: "item",
      targetId,
      beforeId: before.beforeId,
      beforeKind: before.beforeKind,
      indicator: { key, edge: "before" },
    };
  }

  const next = visual[idx + 1];
  if (next) {
    const nextKey = rowDomKey(next);
    const before = visualBeforeTarget(folderId, nextKey, rows, draggingKey);
    return {
      mode: "item",
      targetId,
      beforeId: before.beforeId,
      beforeKind: before.beforeKind,
      indicator: { key: nextKey, edge: "before" },
    };
  }

  return {
    mode: "item",
    targetId,
    beforeId: null,
    beforeKind: null,
    indicator: { key, edge: "after" },
  };
}

function nearestItemInContainer(
  container: Element,
  clientY: number,
): HTMLElement | null {
  const items = container.querySelectorAll(".caster-lib-item[data-nav-key]");
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const node of items) {
    if (!(node instanceof HTMLElement)) continue;
    const rect = node.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const dist = Math.abs(clientY - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  }
  return best;
}

function nearestFolderRowInContainer(
  container: Element,
  clientY: number,
): HTMLElement | null {
  const rows = container.querySelectorAll(
    ".caster-lib-nav-row--folder[data-nav-key]",
  );
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const node of rows) {
    if (!(node instanceof HTMLElement)) continue;
    const rect = node.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const dist = Math.abs(clientY - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  }
  return best;
}

export function resolveItemDropHit(
  clientX: number,
  clientY: number,
  draggingKey: string,
  rows: AutomationRow[],
): ItemDropHit | null {
  const draggingEl = document.querySelector(
    `.caster-lib-item[data-nav-key="${CSS.escape(draggingKey)}"]`,
  );
  if (draggingEl instanceof HTMLElement) {
    const r = draggingEl.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return cancelItemHit();
    }
  }

  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    if (el.closest(".caster-lib-drag-cursor")) continue;

    const folderRow = el.closest(".caster-lib-nav-row--folder");
    if (folderRow instanceof HTMLElement) {
      const folderNode = folderRow.closest(
        ".caster-lib-tree-node[data-folder-drop-id]",
      );
      if (folderNode instanceof HTMLElement) {
        const id = folderNode.dataset.folderDropId ?? null;
        if (id) {
          return {
            mode: "item",
            targetId: id,
            beforeId: null,
            beforeKind: null,
            indicator: null,
          };
        }
      }
    }

    const itemEl = el.closest(".caster-lib-item[data-nav-key]");
    if (itemEl instanceof HTMLElement) {
      const hit = hitFromItem(itemEl, clientY, draggingKey, rows);
      if (hit) return hit;
      continue;
    }

    const list =
      el.closest(".caster-lib-tree-children") ??
      el.closest(".caster-lib-unfiled") ??
      el.closest(".caster-lib-tree-root");
    if (list instanceof Element) {
      const near = nearestItemInContainer(list, clientY);
      if (near) {
        const hit = hitFromItem(near, clientY, draggingKey, rows);
        if (hit) return hit;
      }
      const folderNode = list.closest(
        ".caster-lib-tree-node[data-folder-drop-id]",
      );
      if (
        folderNode instanceof HTMLElement &&
        list.classList.contains("caster-lib-tree-children")
      ) {
        const id = folderNode.dataset.folderDropId ?? null;
        if (id) {
          return {
            mode: "item",
            targetId: id,
            beforeId: null,
            beforeKind: null,
            indicator: null,
          };
        }
      }
      if (list.classList.contains("caster-lib-unfiled")) {
        return {
          mode: "item",
          targetId: UNFILED_ID,
          beforeId: null,
          beforeKind: null,
          indicator: null,
        };
      }
    }
  }
  return null;
}

function folderHitFromRow(
  folderRow: HTMLElement,
  clientY: number,
  dragged: AutomationFolderOption,
  folders: AutomationFolderOption[],
): FolderDropHit | null {
  const key = folderRow.dataset.navKey ?? null;
  if (!key?.startsWith("folder:")) return null;
  const targetId = key.slice("folder:".length);
  if (targetId === dragged.id) return cancelFolderHit();

  const target = folders.find((f) => f.id === targetId);
  if (!target) return null;
  if (isFolderDescendant(folders, dragged.id, targetId)) {
    return cancelFolderHit();
  }

  const rect = folderRow.getBoundingClientRect();
  const y = clientY - rect.top;
  const nestZone = rect.height * 0.28;
  const inNest = y >= nestZone && y <= rect.height - nestZone;

  if (inNest && canNestFolder(folders, dragged.id, targetId)) {
    return {
      mode: "folder",
      nestIntoId: targetId,
      parentId: targetId,
      beforeFolderId: null,
      indicator: null,
    };
  }

  const parentId = target.parentId ?? null;
  if (!canNestFolder(folders, dragged.id, parentId)) {
    return cancelFolderHit();
  }

  const siblings = sortSiblingFolders(folders, parentId).filter(
    (f) => f.id !== dragged.id,
  );
  const idx = siblings.findIndex((f) => f.id === targetId);
  if (idx < 0) return null;

  const after = clientY > rect.top + rect.height / 2;
  if (!after) {
    return {
      mode: "folder",
      nestIntoId: null,
      parentId,
      beforeFolderId: targetId,
      indicator: { key, edge: "before" },
    };
  }

  const next = siblings[idx + 1];
  if (next) {
    const nextKey = folderNavKey(next.id);
    return {
      mode: "folder",
      nestIntoId: null,
      parentId,
      beforeFolderId: next.id,
      indicator: { key: nextKey, edge: "before" },
    };
  }

  return {
    mode: "folder",
    nestIntoId: null,
    parentId,
    beforeFolderId: null,
    indicator: { key, edge: "after" },
  };
}

export function resolveFolderDropHit(
  clientX: number,
  clientY: number,
  dragged: AutomationFolderOption,
  folders: AutomationFolderOption[],
): FolderDropHit | null {
  const dragKey = folderNavKey(dragged.id);
  const draggingEl = document.querySelector(
    `.caster-lib-nav-row--folder[data-nav-key="${CSS.escape(dragKey)}"]`,
  );
  if (draggingEl instanceof HTMLElement) {
    const r = draggingEl.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return cancelFolderHit();
    }
  }

  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    if (el.closest(".caster-lib-drag-cursor")) continue;

    const folderRow = el.closest(".caster-lib-nav-row--folder");
    if (folderRow instanceof HTMLElement) {
      const hit = folderHitFromRow(folderRow, clientY, dragged, folders);
      if (hit) return hit;
      continue;
    }

    // Dropping a folder onto an item → nest into that item's folder.
    const itemEl = el.closest(".caster-lib-item[data-nav-key]");
    if (itemEl instanceof HTMLElement) {
      const itemKey = itemEl.dataset.navKey ?? "";
      // Prefer containing folder node.
      const folderNode = itemEl.closest(
        ".caster-lib-tree-node[data-folder-drop-id]",
      );
      if (folderNode instanceof HTMLElement) {
        const id = folderNode.dataset.folderDropId ?? null;
        if (id && id !== dragged.id && canNestFolder(folders, dragged.id, id)) {
          return {
            mode: "folder",
            nestIntoId: id,
            parentId: id,
            beforeFolderId: null,
            indicator: null,
          };
        }
      }
      if (itemKey) {
        // Unfiled item → move folder to root (append).
        if (canNestFolder(folders, dragged.id, null)) {
          return {
            mode: "folder",
            nestIntoId: null,
            parentId: null,
            beforeFolderId: null,
            indicator: null,
          };
        }
      }
      continue;
    }

    const list =
      el.closest(".caster-lib-tree-children") ??
      el.closest(".caster-lib-unfiled") ??
      el.closest(".caster-lib-tree-root");
    if (list instanceof Element) {
      const nearFolder = nearestFolderRowInContainer(list, clientY);
      if (nearFolder) {
        const hit = folderHitFromRow(nearFolder, clientY, dragged, folders);
        if (hit) return hit;
      }

      if (list.classList.contains("caster-lib-tree-children")) {
        const folderNode = list.closest(
          ".caster-lib-tree-node[data-folder-drop-id]",
        );
        if (folderNode instanceof HTMLElement) {
          const id = folderNode.dataset.folderDropId ?? null;
          if (
            id &&
            id !== dragged.id &&
            canNestFolder(folders, dragged.id, id)
          ) {
            return {
              mode: "folder",
              nestIntoId: id,
              parentId: id,
              beforeFolderId: null,
              indicator: null,
            };
          }
        }
      }

      if (
        list.classList.contains("caster-lib-unfiled") ||
        list.classList.contains("caster-lib-tree-root")
      ) {
        if (canNestFolder(folders, dragged.id, null)) {
          return {
            mode: "folder",
            nestIntoId: null,
            parentId: null,
            beforeFolderId: null,
            indicator: null,
          };
        }
      }
    }
  }
  return null;
}

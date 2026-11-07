import type {
  AutomationFolderOption,
  AutomationKindFilter,
  AutomationRow,
} from "../automations/types";
import { rowKey as orderRowKey } from "../automations/relativeTime";

export type LibScope = "all" | "favorites" | "recent";

export type LibTreeNode = {
  id: string;
  folder: AutomationFolderOption;
  items: AutomationRow[];
  children: LibTreeNode[];
};

export type NavEntry =
  | { type: "folder"; key: string; node: LibTreeNode }
  | { type: "item"; key: string; row: AutomationRow };

export const UNFILED_ID = "__unfiled";

/** Nav / editing key for the inline “new folder” draft row (not a real folder id). */
export const DRAFT_FOLDER_KEY = "folder:__draft__";

/** Nav / editing key for the inline new item draft row. */
export const DRAFT_ITEM_KEY = "item:__draft__";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function folderNavKey(id: string): string {
  return `folder:${id}`;
}

export function rowDomKey(r: Pick<AutomationRow, "kind" | "id">): string {
  return `${r.kind}:${r.id}`;
}

export function stubRow(
  kind: AutomationRow["kind"],
  id: string,
  name: string,
  folder: AutomationFolderOption | null,
): AutomationRow {
  return {
    id,
    name,
    kind,
    triggerLabel: "",
    folderLabel: folder?.name ?? "",
    folderId: folder?.id ?? null,
    status: "healthy",
    lastRunLabel: "",
    favorite: false,
    locked: false,
    dirty: false,
  };
}

export function errMessage(e: unknown, fallback: string): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e instanceof Error && e.message.trim()) return e.message;
  return fallback;
}

export function matchesLibraryQuery(
  row: AutomationRow,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  return (
    row.name.toLowerCase().includes(normalizedQuery) ||
    row.triggerLabel.toLowerCase().includes(normalizedQuery) ||
    row.folderLabel.toLowerCase().includes(normalizedQuery) ||
    (row.meta?.toLowerCase().includes(normalizedQuery) ?? false)
  );
}

export function sortFolders(
  list: AutomationFolderOption[],
): AutomationFolderOption[] {
  return [...list].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}

export function sortLibRows(list: AutomationRow[]): AutomationRow[] {
  return [...list].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id) ||
      a.kind.localeCompare(b.kind),
  );
}

/** Nested folder tree; pruneEmpty drops branches with no matching items.
 *  Unfiled rows stay flat at the root (no fake « Sans dossier » folder). */
export function buildLibTree(
  folders: AutomationFolderOption[],
  rows: AutomationRow[],
  match: (r: AutomationRow) => boolean,
  pruneEmpty: boolean,
): { folders: LibTreeNode[]; unfiled: AutomationRow[] } {
  const byParent = new Map<string | null, AutomationFolderOption[]>();
  for (const f of folders) {
    const key = f.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  for (const [, list] of byParent) {
    sortFolders(list);
  }

  const itemsByFolder = new Map<string | null, AutomationRow[]>();
  for (const r of rows) {
   if (!match(r)) continue;
    const key = r.folderId ?? null;
    const list = itemsByFolder.get(key) ?? [];
    list.push(r);
    itemsByFolder.set(key, list);
  }

  function build(parentId: string | null): LibTreeNode[] {
    const kids = byParent.get(parentId) ?? [];
    const nodes: LibTreeNode[] = [];
    for (const f of kids) {
      const children = build(f.id);
      const items = sortLibRows(itemsByFolder.get(f.id) ?? []);
      if (pruneEmpty && items.length === 0 && children.length === 0) continue;
      nodes.push({ id: f.id, folder: f, items, children });
    }
    return nodes;
  }

  return {
    folders: build(null),
    unfiled: sortLibRows(itemsByFolder.get(null) ?? []),
  };
}

export function flattenVisibleTree(
  nodes: LibTreeNode[],
  isOpen: (n: LibTreeNode) => boolean,
): NavEntry[] {
  const out: NavEntry[] = [];
  for (const node of nodes) {
    out.push({ type: "folder", key: folderNavKey(node.id), node });
    if (!isOpen(node)) continue;
    out.push(...flattenVisibleTree(node.children, isOpen));
    for (const row of node.items) {
      out.push({ type: "item", key: rowDomKey(row), row });
    }
  }
  return out;
}

export function filterBrowseRows(
  allRows: AutomationRow[],
  kindFilter: AutomationKindFilter,
): AutomationRow[] {
  return allRows.filter((r) => {
   if (kindFilter !== "all" && r.kind !== kindFilter) return false;
    return true;
  });
}

export function sortRowsByRecentOrder(
  rows: AutomationRow[],
  recentOrder: string[],
): AutomationRow[] {
  const order = new Map(recentOrder.map((key, i) => [key, i]));
  return rows
    .filter((r) => order.has(orderRowKey(r.kind, r.id)))
    .sort(
      (a, b) =>
        (order.get(orderRowKey(a.kind, a.id)) ?? 0) -
        (order.get(orderRowKey(b.kind, b.id)) ?? 0),
    );
}

export function buildNavigationEntries(opts: {
  scope: LibScope;
  favVisible: AutomationRow[];
  recentVisible?: AutomationRow[];
  folderTree: LibTreeNode[];
  unfiledRows: AutomationRow[];
  isNodeOpen: (n: LibTreeNode) => boolean;
}): NavEntry[] {
  const {
    scope,
    favVisible,
    recentVisible = [],
    folderTree,
    unfiledRows,
    isNodeOpen,
  } = opts;
  if (scope === "favorites") {
    return favVisible.map((row) => ({
      type: "item" as const,
      key: rowDomKey(row),
      row,
    }));
  }
  if (scope === "recent") {
    return recentVisible.map((row) => ({
      type: "item" as const,
      key: rowDomKey(row),
      row,
    }));
  }
  const entries = flattenVisibleTree(folderTree, isNodeOpen);
  for (const row of unfiledRows) {
    entries.push({ type: "item", key: rowDomKey(row), row });
  }
  return entries;
}

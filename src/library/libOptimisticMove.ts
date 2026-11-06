import type {
  AutomationFolderOption,
  AutomationRow,
} from "../automations/types";
import { computeFolderReorderIds } from "./libFolderOrder";
import { sortLibRows } from "./libTree";

function rowKey(r: Pick<AutomationRow, "kind" | "id">): string {
  return `${r.kind}:${r.id}`;
}

/** Patch rows for an optimistic item move (folder + sibling sortOrder). */
export function patchRowsAfterItemMove(
  rows: AutomationRow[],
  moved: AutomationRow,
  nextFolderId: string | null,
  folderLabel: string,
  beforeId: string | null,
  beforeKind: AutomationRow["kind"] | null,
): AutomationRow[] {
  const movedKey = rowKey(moved);
  const without = rows.filter((r) => rowKey(r) !== movedKey);
  const siblings = sortLibRows(
    without.filter(
      (r) => (r.folderId ?? null) === nextFolderId,
    ),
  );
  let at =
    beforeId == null || beforeKind == null
      ? siblings.length
      : siblings.findIndex(
          (r) => r.id === beforeId && r.kind === beforeKind,
        );
  if (at < 0) at = siblings.length;

  const placed: AutomationRow = {
    ...moved,
    folderId: nextFolderId,
    folderLabel,
    sortOrder: at,
  };
  siblings.splice(at, 0, placed);
  const orderByKey = new Map(
    siblings.map((r, i) => [rowKey(r), i] as const),
  );

  const next = without.map((r) => {
    const order = orderByKey.get(rowKey(r));
    if (order === undefined) return r;
    return { ...r, sortOrder: order };
  });
  next.push({ ...placed, sortOrder: orderByKey.get(movedKey) ?? at });
  return next;
}

/** Patch folders for an optimistic folder reparent + reorder. */
export function patchFoldersAfterFolderMove(
  folders: AutomationFolderOption[],
  folderId: string,
  parentId: string | null,
  beforeFolderId: string | null,
): AutomationFolderOption[] | null {
  const ordered = computeFolderReorderIds(
    folders,
    folderId,
    parentId,
    beforeFolderId,
  );
  if (!ordered) return null;
  const orderMap = new Map(ordered.map((id, i) => [id, i] as const));
  return folders.map((f) => {
    const sortOrder = orderMap.get(f.id) ?? f.sortOrder ?? 0;
    if (f.id === folderId) {
      return { ...f, parentId, sortOrder };
    }
    return { ...f, sortOrder };
  });
}

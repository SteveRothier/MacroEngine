import { describe, expect, it } from "vitest";
import type {
  AutomationFolderOption,
  AutomationRow,
} from "../automations/types";
import {
  patchFoldersAfterFolderMove,
  patchRowsAfterItemMove,
} from "./libOptimisticMove";

function row(
  partial: Partial<AutomationRow> &
    Pick<AutomationRow, "id" | "name" | "kind">,
): AutomationRow {
  return {
    folderId: null,
    folderLabel: "—",
    favorite: false,
    locked: false,
    dirty: false,
    status: "healthy",
    triggerLabel: "",
    sortOrder: 0,
    ...partial,
  };
}

function folder(
  partial: Partial<AutomationFolderOption> &
    Pick<AutomationFolderOption, "id" | "name">,
): AutomationFolderOption {
  return {
    parentId: null,
    sortOrder: 0,
    ...partial,
  };
}

describe("patchRowsAfterItemMove", () => {
  const a = row({ id: "a", name: "A", kind: "macro", sortOrder: 0 });
  const b = row({ id: "b", name: "B", kind: "clicker", sortOrder: 1 });
  const c = row({
    id: "c",
    name: "C",
    kind: "script",
    sortOrder: 0,
    folderId: "albion",
    folderLabel: "Albion",
  });

  it("reorders within the same folder before a target", () => {
    const next = patchRowsAfterItemMove(
      [a, b],
      b,
      null,
      "—",
      "a",
      "macro",
    );
    const unfiled = next
      .filter((r) => (r.folderId ?? null) === null)
      .sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
    expect(unfiled.map((r) => r.id)).toEqual(["b", "a"]);
    expect(unfiled.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it("moves into another folder at end when before is null", () => {
    const next = patchRowsAfterItemMove(
      [a, b, c],
      a,
      "albion",
      "Albion",
      null,
      null,
    );
    const moved = next.find((r) => r.id === "a" && r.kind === "macro")!;
    expect(moved.folderId).toBe("albion");
    expect(moved.folderLabel).toBe("Albion");
    const inAlbion = next
      .filter((r) => r.folderId === "albion")
      .sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
    expect(inAlbion.map((r) => r.id)).toEqual(["c", "a"]);
    expect(inAlbion.map((r) => r.sortOrder)).toEqual([0, 1]);
  });
});

describe("patchFoldersAfterFolderMove", () => {
  const rootA = folder({ id: "a", name: "A", sortOrder: 0 });
  const rootB = folder({ id: "b", name: "B", sortOrder: 1 });
  const child = folder({
    id: "c",
    name: "C",
    parentId: "a",
    sortOrder: 2,
  });

  it("reorders sibling folders", () => {
    const next = patchFoldersAfterFolderMove(
      [rootA, rootB, child],
      "b",
      null,
      "a",
    );
    expect(next).not.toBeNull();
    const roots = next!
      .filter((f) => f.parentId == null)
      .sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
    // Global sortOrder follows DFS order from computeFolderReorderIds
    expect(roots.map((f) => f.id)).toEqual(["b", "a"]);
    expect(next!.find((f) => f.id === "b")!.parentId).toBeNull();
  });

  it("returns null when nesting would exceed depth", () => {
    const deep = [
      folder({ id: "1", name: "1", sortOrder: 0 }),
      folder({ id: "2", name: "2", parentId: "1", sortOrder: 1 }),
      folder({ id: "3", name: "3", parentId: "2", sortOrder: 2 }),
      folder({ id: "x", name: "X", sortOrder: 3 }),
    ];
    expect(patchFoldersAfterFolderMove(deep, "x", "3", null)).toBeNull();
  });
});

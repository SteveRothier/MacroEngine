import { describe, expect, it } from "vitest";
import type { AutomationFolderOption, AutomationRow } from "../automations/types";
import {
  buildLibTree,
  buildNavigationEntries,
  matchesLibraryQuery,
  rowDomKey,
} from "./libTree";

function folder(
  partial: Partial<AutomationFolderOption> & Pick<AutomationFolderOption, "id" | "name">,
): AutomationFolderOption {
  return {
    parentId: null,
    sortOrder: 0,
    ...partial,
  };
}

function row(
  partial: Partial<AutomationRow> &
    Pick<AutomationRow, "id" | "name" | "kind">,
): AutomationRow {
  return {
    triggerLabel: "",
    folderLabel: "",
    folderId: null,
    status: "healthy",
    lastRunLabel: "",
    favorite: false,
    locked: false,
    dirty: false,
    ...partial,
  };
}

describe("matchesLibraryQuery", () => {
  it("matches name / trigger / folder / meta", () => {
    const r = row({
      id: "1",
      name: "Albion Market",
      kind: "macro",
      triggerLabel: "F1",
      folderLabel: "Games",
      meta: "trade",
    });
    expect(matchesLibraryQuery(r, "")).toBe(true);
    expect(matchesLibraryQuery(r, "albion")).toBe(true);
    expect(matchesLibraryQuery(r, "f1")).toBe(true);
    expect(matchesLibraryQuery(r, "games")).toBe(true);
    expect(matchesLibraryQuery(r, "trade")).toBe(true);
    expect(matchesLibraryQuery(r, "zzz")).toBe(false);
  });
});

describe("buildLibTree", () => {
  const folders = [
    folder({ id: "root", name: "Root" }),
    folder({ id: "child", name: "Child", parentId: "root" }),
    folder({ id: "empty", name: "Empty" }),
  ];
  const rows = [
    row({ id: "a", name: "In root", kind: "macro", folderId: "root" }),
    row({ id: "b", name: "In child", kind: "clicker", folderId: "child" }),
    row({ id: "c", name: "Unfiled", kind: "script", folderId: null }),
  ];

  it("nests folders and keeps unfiled at root", () => {
    const tree = buildLibTree(folders, rows, () => true, false);
    expect(tree.folders.map((n) => n.id).sort()).toEqual(["empty", "root"]);
    const root = tree.folders.find((n) => n.id === "root")!;
    expect(root.items.map((r) => r.id)).toEqual(["a"]);
    expect(root.children.map((n) => n.id)).toEqual(["child"]);
    expect(root.children[0]!.items.map((r) => r.id)).toEqual(["b"]);
    expect(tree.unfiled.map((r) => r.id)).toEqual(["c"]);
  });

  it("prunes empty branches when searching", () => {
    const tree = buildLibTree(
      folders,
      rows,
      (r) => matchesLibraryQuery(r, "child"),
      true,
    );
    expect(tree.folders.map((n) => n.id)).toEqual(["root"]);
    expect(tree.folders[0]!.children.map((n) => n.id)).toEqual(["child"]);
    expect(tree.unfiled).toEqual([]);
  });
});

describe("buildNavigationEntries", () => {
  const fav = row({ id: "f", name: "Fav", kind: "macro", favorite: true });
  const unfiled = row({ id: "u", name: "U", kind: "clicker" });
  const folderNode = {
    id: "albion",
    folder: folder({ id: "albion", name: "Albion" }),
    items: [row({ id: "m", name: "M", kind: "macro", folderId: "albion" })],
    children: [] as never[],
  };

  it("flattens favorites scope", () => {
    expect(
      buildNavigationEntries({
        scope: "favorites",
        favVisible: [fav],
        folderTree: [folderNode],
        unfiledRows: [unfiled],
        isNodeOpen: () => true,
      }).map((e) => e.key),
    ).toEqual([rowDomKey(fav)]);
  });

  it("includes open folders, items, then unfiled for all", () => {
    const keys = buildNavigationEntries({
      scope: "all",
      favVisible: [],
      folderTree: [folderNode],
      unfiledRows: [unfiled],
      isNodeOpen: () => true,
    }).map((e) => e.key);
    expect(keys).toEqual([
      "folder:albion",
      rowDomKey(folderNode.items[0]!),
      rowDomKey(unfiled),
    ]);
  });
});

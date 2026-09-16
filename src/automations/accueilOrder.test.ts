import { describe, expect, it } from "vitest";
import {
  applyAccueilOrder,
  beforeKeyForEndOfFolder,
  mergeAccueilOrder,
  nearestSameKindBeforeId,
  reorderAccueilKeys,
  rowOrderKey,
} from "./accueilOrder";
import type { AutomationRow } from "./types";

function row(
  partial: Pick<AutomationRow, "kind" | "id"> &
    Partial<Pick<AutomationRow, "folderId">>,
): Pick<AutomationRow, "kind" | "id" | "folderId"> {
  return { folderId: null, ...partial };
}

describe("accueilOrder helpers", () => {
  it("rowOrderKey", () => {
    expect(rowOrderKey({ kind: "macro", id: "A" })).toBe("macro:A");
  });

  it("mergeAccueilOrder keeps saved and appends newcomers", () => {
    expect(
      mergeAccueilOrder(["macro:A", "gone:X", "clicker:B"], [
        "clicker:B",
        "macro:C",
        "macro:A",
      ]),
    ).toEqual(["macro:A", "clicker:B", "macro:C"]);
  });

  it("reorderAccueilKeys moves before target", () => {
    const keys = ["macro:A", "clicker:B", "script:C"];
    expect(reorderAccueilKeys(keys, "script:C", "macro:A")).toEqual([
      "script:C",
      "macro:A",
      "clicker:B",
    ]);
    expect(reorderAccueilKeys(keys, "macro:A", null)).toEqual([
      "clicker:B",
      "script:C",
      "macro:A",
    ]);
    expect(reorderAccueilKeys(keys, "macro:A", "clicker:B")).toBeNull();
  });

  it("beforeKeyForEndOfFolder appends after folder members", () => {
    const keys = ["macro:A", "clicker:B", "macro:C", "script:S"];
    const rows = [
      row({ kind: "macro", id: "A", folderId: "f1" }),
      row({ kind: "clicker", id: "B", folderId: "f1" }),
      row({ kind: "macro", id: "C", folderId: null }),
      row({ kind: "script", id: "S" }),
    ];
    expect(
      beforeKeyForEndOfFolder(keys, rows, "macro:C", "f1", ["f1"]),
    ).toBe("script:S");
    // empty folder → before first unfiled / script / later section
    expect(
      beforeKeyForEndOfFolder(
        keys,
        rows.map((r) =>
          r.folderId === "f1" ? { ...r, folderId: null } : r,
        ),
        "macro:C",
        "f1",
        ["f1"],
      ),
    ).toBe("macro:A");
  });

  it("applyAccueilOrder sorts by rank", () => {
    const rows = [
      { kind: "macro" as const, id: "A" },
      { kind: "clicker" as const, id: "B" },
      { kind: "script" as const, id: "C" },
    ];
    expect(
      applyAccueilOrder(rows, ["script:C", "macro:A", "clicker:B"]).map(
        rowOrderKey,
      ),
    ).toEqual(["script:C", "macro:A", "clicker:B"]);
  });

  it("nearestSameKindBeforeId finds next same kind", () => {
    const keys = [
      "macro:A",
      "clicker:X",
      "macro:B",
      "script:S",
      "macro:C",
    ];
    expect(nearestSameKindBeforeId(keys, "macro:A", "macro")).toBe("B");
    expect(nearestSameKindBeforeId(keys, "macro:C", "macro")).toBeNull();
    expect(nearestSameKindBeforeId(keys, "clicker:X", "clicker")).toBeNull();
  });
});

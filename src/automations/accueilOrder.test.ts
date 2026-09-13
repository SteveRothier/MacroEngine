import { describe, expect, it } from "vitest";
import {
  applyAccueilOrder,
  mergeAccueilOrder,
  nearestSameKindBeforeId,
  reorderAccueilKeys,
  rowOrderKey,
} from "./accueilOrder";

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

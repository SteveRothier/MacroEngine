import { describe, expect, it } from "vitest";
import {
  canReorderAccueilRows,
  resolveAccueilReorderDrop,
} from "./accueilDrop";
import {
  applyAccueilOrder,
  mergeAccueilOrder,
  reorderAccueilKeys,
  rowOrderKey,
} from "./accueilOrder";

function row(kind: "macro" | "clicker" | "script", id: string) {
  return { id, kind };
}

describe("resolveAccueilReorderDrop (cross-kind)", () => {
  const visible = [
    row("macro", "a"),
    row("clicker", "b"),
    row("script", "c"),
  ];

  it("allows dropping a clicker before a macro", () => {
    const r = resolveAccueilReorderDrop(
      visible[1]!,
      visible[0]!,
      "before",
      visible,
    );
    expect(r).toEqual({
      kind: "reorder",
      fromKey: "clicker:b",
      beforeKey: "macro:a",
      targetKey: "macro:a",
      edge: "before",
    });
  });

  it("allows dropping a script after a clicker", () => {
    const r = resolveAccueilReorderDrop(
      visible[2]!,
      visible[0]!,
      "after",
      visible,
    );
    expect(r).toEqual({
      kind: "reorder",
      fromKey: "script:c",
      beforeKey: "clicker:b",
      targetKey: "macro:a",
      edge: "after",
    });
  });

  it("returns null for no-op", () => {
    expect(
      resolveAccueilReorderDrop(visible[0]!, visible[1]!, "before", visible),
    ).toBeNull();
  });

  it("canReorderAccueilRows accepts mixed kinds", () => {
    expect(canReorderAccueilRows(visible[0]!, visible[1]!)).toBe(true);
    expect(canReorderAccueilRows(visible[0]!, visible[0]!)).toBe(false);
  });
});

describe("accueilOrder helpers", () => {
  it("merges saved order with newcomers", () => {
    expect(
      mergeAccueilOrder(
        ["macro:a", "gone", "clicker:b"],
        ["clicker:b", "macro:a", "script:c"],
      ),
    ).toEqual(["macro:a", "clicker:b", "script:c"]);
  });

  it("reorders keys across kinds", () => {
    const keys = ["macro:a", "clicker:b", "script:c"];
    expect(reorderAccueilKeys(keys, "script:c", "macro:a")).toEqual([
      "script:c",
      "macro:a",
      "clicker:b",
    ]);
    expect(reorderAccueilKeys(keys, "macro:a", null)).toEqual([
      "clicker:b",
      "script:c",
      "macro:a",
    ]);
    expect(reorderAccueilKeys(keys, "macro:a", "clicker:b")).toBeNull();
  });

  it("applyAccueilOrder sorts by key list", () => {
    const rows = [
      row("script", "c"),
      row("macro", "a"),
      row("clicker", "b"),
    ];
    const ordered = applyAccueilOrder(rows, [
      "clicker:b",
      "macro:a",
      "script:c",
    ]);
    expect(ordered.map(rowOrderKey)).toEqual([
      "clicker:b",
      "macro:a",
      "script:c",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { remapCollapsedAfterReorder } from "./collapseRemap";

describe("remapCollapsedAfterReorder", () => {
  it("moves collapsed key with same-parent reorder", () => {
    const collapsed = new Set(["1"]);
    const next = remapCollapsedAfterReorder(collapsed, [1], [3]);
    expect([...next].sort()).toEqual(["3"]);
  });

  it("moves nested collapsed keys under the relocated prefix", () => {
    const collapsed = new Set(["1", "1.0.0"]);
    const next = remapCollapsedAfterReorder(collapsed, [1], [3]);
    expect([...next].sort()).toEqual(["3", "3.0.0"]);
  });

  it("adjusts non-moved siblings after remove+insert", () => {
    // [0,1_collapsed,2,3] move 1 → 3  =>  [0,2,3,1]
    // sibling at 2 becomes 1; sibling at 3 becomes 2
    const collapsed = new Set(["2"]);
    const next = remapCollapsedAfterReorder(collapsed, [1], [3]);
    expect([...next].sort()).toEqual(["1"]);
  });
});

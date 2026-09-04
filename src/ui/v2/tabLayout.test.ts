import { describe, expect, it } from "vitest";
import { TAB_LAYOUT, clampTabWidth, computeTargetTabWidth } from "./tabLayout";

describe("tabLayout", () => {
  it("clampTabWidth respects min and max", () => {
    expect(clampTabWidth(10)).toBe(TAB_LAYOUT.MIN_W);
    expect(clampTabWidth(500)).toBe(TAB_LAYOUT.MAX_W);
    expect(clampTabWidth(100)).toBe(100);
  });

  it("computeTargetTabWidth divides available strip space", () => {
    const scroll = {
      clientWidth: 400,
    } as HTMLElement;
    const addBtn = { offsetWidth: 36 } as HTMLElement;
    const target = computeTargetTabWidth(scroll, addBtn, 4);
    const gaps = 4 * TAB_LAYOUT.STRIP_GAP_PX;
    expect(target).toBe(Math.floor((400 - 36 - gaps) / 4));
  });

  it("computeTargetTabWidth returns max when empty", () => {
    const scroll = { clientWidth: 400 } as HTMLElement;
    expect(computeTargetTabWidth(scroll, null, 0)).toBe(TAB_LAYOUT.MAX_W);
  });
});

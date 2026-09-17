import { describe, expect, it } from "vitest";
import { TAB_LAYOUT, clampTabWidth, computeTargetTabWidth } from "./tabLayout";

describe("tabLayout", () => {
  it("clampTabWidth respects min and max", () => {
    expect(clampTabWidth(10)).toBe(TAB_LAYOUT.MIN_W);
    expect(clampTabWidth(TAB_LAYOUT.MAX_W + 100)).toBe(TAB_LAYOUT.MAX_W);
    expect(clampTabWidth(100)).toBe(100);
  });

  it("computeTargetTabWidth divides available strip space up to max", () => {
    const scroll = {
      clientWidth: 2000,
    } as HTMLElement;
    const addBtn = { offsetWidth: 36 } as HTMLElement;
    const target = computeTargetTabWidth(scroll, addBtn, 2);
    expect(target).toBe(TAB_LAYOUT.MAX_W);
  });

  it("computeTargetTabWidth shrinks when strip is crowded", () => {
    const scroll = {
      clientWidth: 200,
    } as HTMLElement;
    const addBtn = { offsetWidth: 36 } as HTMLElement;
    const target = computeTargetTabWidth(scroll, addBtn, 4);
    const gaps = 4 * TAB_LAYOUT.STRIP_GAP_PX;
    const chrome = 36 + TAB_LAYOUT.DRAG_FILL_W;
    expect(target).toBe(
      Math.max(TAB_LAYOUT.MIN_W, Math.floor((200 - chrome - gaps) / 4)),
    );
    expect(target).toBeLessThan(TAB_LAYOUT.MAX_W);
  });

  it("computeTargetTabWidth returns max when empty", () => {
    const scroll = { clientWidth: 400 } as HTMLElement;
    expect(computeTargetTabWidth(scroll, null, 0)).toBe(TAB_LAYOUT.MAX_W);
  });
});

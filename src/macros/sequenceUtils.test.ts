import { describe, expect, it } from "vitest";
import { actionOffsetMs, formatActionOffset } from "./sequenceUtils";
import type { MacroAction } from "./types";

const delay = (ms: number, id = "d"): MacroAction => ({
  id,
  type: "delay",
  ms,
});

const click = (id = "c"): MacroAction => ({
  id,
  type: "mouse.click",
  button: "left",
  x: null,
  y: null,
});

describe("sequenceUtils", () => {
  it("actionOffsetMs sums prior delays on the root path", () => {
    const actions: MacroAction[] = [delay(100, "a"), click("b"), delay(50, "c")];
    expect(actionOffsetMs(actions, [0])).toBe(0);
    expect(actionOffsetMs(actions, [1])).toBe(100);
    expect(actionOffsetMs(actions, [2])).toBe(100);
  });

  it("formatActionOffset shows delta from previous", () => {
    const actions: MacroAction[] = [delay(100), click(), delay(50)];
    expect(formatActionOffset(actions, [0], 0)).toBe("0ms");
    expect(formatActionOffset(actions, [1], 0)).toBe("+100ms");
  });
});

import { describe, expect, it } from "vitest";
import { clamp, nextCustomZoneColor } from "./zoneGeom";

describe("zoneGeom", () => {
  it("clamp keeps values in range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it("nextCustomZoneColor prefers unused palette colors", () => {
    const a = nextCustomZoneColor([]);
    const b = nextCustomZoneColor([a]);
    expect(b).not.toBe(a);
  });
});

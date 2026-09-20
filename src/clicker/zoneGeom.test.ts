import { describe, expect, it } from "vitest";
import type { ScreenGeomDto } from "./clickerTypes";
import {
  clamp,
  clientToScreen,
  deltaToScreen,
  geomScaleFactor,
  nextCustomZoneColor,
} from "./zoneGeom";

function domRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

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

  it("clientToScreen maps to the primary display", () => {
    const geom: ScreenGeomDto = { x: 0, y: 0, width: 1920, height: 1080 };
    const rect = domRect(0, 0, 960, 540);
    expect(clientToScreen(0, 0, rect, geom)).toEqual({ x: 0, y: 0 });
    expect(clientToScreen(480, 270, rect, geom)).toEqual({ x: 960, y: 540 });
  });

  it("clientToScreen adds the display origin on a secondary monitor", () => {
    const geom: ScreenGeomDto = { x: 1920, y: -120, width: 2560, height: 1440 };
    const rect = domRect(0, 0, 640, 360);
    expect(clientToScreen(0, 0, rect, geom)).toEqual({ x: 1920, y: -120 });
    expect(clientToScreen(320, 180, rect, geom)).toEqual({
      x: 1920 + 1280,
      y: -120 + 720,
    });
    expect(clientToScreen(640, 360, rect, geom)).toEqual({
      x: 1920 + 2560,
      y: -120 + 1440,
    });
  });

  it("clientToScreen offsets the pointer by the element rect", () => {
    const geom: ScreenGeomDto = { x: -1920, y: 0, width: 1920, height: 1080 };
    const rect = domRect(40, 60, 480, 270);
    expect(clientToScreen(40, 60, rect, geom)).toEqual({ x: -1920, y: 0 });
    expect(clientToScreen(280, 195, rect, geom)).toEqual({ x: -960, y: 540 });
  });

  it("clientToScreen ignores scaleFactor (width/height already physical)", () => {
    const rect = domRect(0, 0, 800, 450);
    const base: ScreenGeomDto = { x: 1920, y: 0, width: 3840, height: 2160 };
    const scaled: ScreenGeomDto = { ...base, scaleFactor: 2 };
    expect(clientToScreen(400, 225, rect, scaled)).toEqual(
      clientToScreen(400, 225, rect, base),
    );
    expect(clientToScreen(400, 225, rect, scaled)).toEqual({
      x: 1920 + 1920,
      y: 1080,
    });
  });

  it("clientToScreen clamps outside pointers to the display", () => {
    const geom: ScreenGeomDto = { x: 1920, y: 0, width: 1920, height: 1080 };
    const rect = domRect(0, 0, 960, 540);
    expect(clientToScreen(-50, -50, rect, geom)).toEqual({ x: 1920, y: 0 });
    expect(clientToScreen(5000, 5000, rect, geom)).toEqual({
      x: 3840,
      y: 1080,
    });
  });

  it("clientToScreen falls back when geometry is degenerate", () => {
    const geom: ScreenGeomDto = { x: 0, y: 0, width: 0, height: 0 };
    const rect = domRect(0, 0, 960, 540);
    expect(clientToScreen(480, 270, rect, geom)).toEqual({ x: 960, y: 540 });
  });

  it("deltaToScreen scales a drag by the display size", () => {
    const geom: ScreenGeomDto = { x: 1920, y: 0, width: 2560, height: 1440 };
    const rect = domRect(0, 0, 640, 360);
    expect(deltaToScreen(64, 36, rect, geom)).toEqual({ dx: 256, dy: 144 });
  });

  it("geomScaleFactor defaults to 1 for missing or invalid values", () => {
    expect(geomScaleFactor({ x: 0, y: 0, width: 800, height: 600 })).toBe(1);
    expect(
      geomScaleFactor({ x: 0, y: 0, width: 800, height: 600, scaleFactor: 0 }),
    ).toBe(1);
    expect(
      geomScaleFactor({ x: 0, y: 0, width: 800, height: 600, scaleFactor: 1.5 }),
    ).toBe(1.5);
  });
});

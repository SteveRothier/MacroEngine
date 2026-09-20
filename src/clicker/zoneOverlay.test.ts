import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  setZoneOverlayVisible,
  pushZoneOverlayState,
  drawSafetyZone,
} from "./zoneOverlay";

describe("zoneOverlay IPC helpers", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockResolvedValue(() => {});
  });

  it("setZoneOverlayVisible invokes set_zone_overlay_visible", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await setZoneOverlayVisible(true);
    expect(invoke).toHaveBeenCalledWith("set_zone_overlay_visible", {
      visible: true,
    });
  });

  it("pushZoneOverlayState forwards geom and zones", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const geom = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };
    const zones = [
      {
        id: "z1",
        kind: "safety" as const,
        action: "stop" as const,
        rect: { x: 10, y: 10, width: 100, height: 80 },
      },
    ];
    await pushZoneOverlayState(geom as never, zones as never);
    expect(invoke).toHaveBeenCalledWith("push_zone_overlay_state", {
      geom,
      zones,
    });
  });

  it("drawSafetyZone resolves null when begin fails", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no window"));
    const result = await drawSafetyZone();
    expect(result).toBeNull();
  });

  it("drawSafetyZone resolves rect from zones://drawn", async () => {
    const rect = { x: 1, y: 2, width: 30, height: 40 };
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      if (event === "zones://drawn") {
        queueMicrotask(() => {
          (handler as (e: { payload: typeof rect }) => void)({
            payload: rect,
          });
        });
      }
      return () => {};
    });
    vi.mocked(invoke).mockResolvedValue(undefined);
    const result = await drawSafetyZone();
    expect(result).toEqual(rect);
    expect(invoke).toHaveBeenCalledWith("begin_zone_overlay_draw");
  });
});

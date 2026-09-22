import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  setTargetOverlayVisible,
  pushTargetOverlayState,
} from "./targetOverlay";

describe("targetOverlay IPC helpers", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("setTargetOverlayVisible invokes set_target_overlay_visible", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await setTargetOverlayVisible(true);
    expect(invoke).toHaveBeenCalledWith("set_target_overlay_visible", {
      visible: true,
    });
  });

  it("pushTargetOverlayState forwards geom, mode, fixed and points", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const geom = { x: 0, y: 0, width: 1920, height: 1080 };
    const points = [{ x: 10, y: 20, clicks: 1, radius: 5 }];
    await pushTargetOverlayState({
      geom: geom as never,
      mode: "sequence",
      fixed: null,
      points,
    });
    expect(invoke).toHaveBeenCalledWith("push_target_overlay_state", {
      geom,
      mode: "sequence",
      fixed: null,
      points,
    });
  });

  it("pushTargetOverlayState sends fixed point in fixed mode", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const geom = { x: 0, y: 0, width: 800, height: 600 };
    await pushTargetOverlayState({
      geom: geom as never,
      mode: "fixed",
      fixed: { x: 100, y: 200 },
      points: [],
    });
    expect(invoke).toHaveBeenCalledWith("push_target_overlay_state", {
      geom,
      mode: "fixed",
      fixed: { x: 100, y: 200 },
      points: [],
    });
  });
});

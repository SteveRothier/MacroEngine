import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ScreenGeomDto, StopZone } from "./clickerTypes";

export type DrawnRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function setZoneOverlayVisible(visible: boolean) {
  await invoke("set_zone_overlay_visible", { visible });
}

export async function pushZoneOverlayState(
  geom: ScreenGeomDto,
  zones: StopZone[],
) {
  await invoke("push_zone_overlay_state", { geom, zones });
}

/** Opens the zone overlay in draw mode; null if cancelled. */
export async function drawSafetyZone(): Promise<DrawnRect | null> {
  return new Promise((resolve) => {
    let settled = false;
    let unDrawn: (() => void) | undefined;
    let unCancel: (() => void) | undefined;

    const cleanup = () => {
      unDrawn?.();
      unCancel?.();
    };

    const finish = (value: DrawnRect | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    void (async () => {
      try {
        unDrawn = await listen<DrawnRect>("zones://drawn", (e) => {
          finish(e.payload);
        });
        unCancel = await listen("zones://draw-cancel", () => {
          finish(null);
        });
        await invoke("begin_zone_overlay_draw");
      } catch {
        finish(null);
      }
    })();
  });
}

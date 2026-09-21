import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ScreenGeomDto, StopZone } from "./clickerTypes";

export type DrawnRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const ZONE_DRAW_TIMEOUT_MS = 30_000;

export async function setZoneOverlayVisible(visible: boolean) {
  await invoke("set_zone_overlay_visible", { visible });
}

export async function pushZoneOverlayState(
  geom: ScreenGeomDto,
  zones: StopZone[],
) {
  await invoke("push_zone_overlay_state", { geom, zones });
}

/** Opens the zone overlay in draw mode; null if cancelled or timed out. */
export async function drawSafetyZone(): Promise<DrawnRect | null> {
  return new Promise((resolve) => {
    let settled = false;
    let unDrawn: (() => void) | undefined;
    let unCancel: (() => void) | undefined;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

    const cleanup = () => {
      if (timer != null) globalThis.clearTimeout(timer);
      unDrawn?.();
      unCancel?.();
    };

    const finish = (value: DrawnRect | null, releaseBackend: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (releaseBackend) {
        void invoke("complete_zone_overlay_draw", { rect: null }).catch(
          () => {},
        );
      }
      resolve(value);
    };

    timer = globalThis.setTimeout(
      () => finish(null, true),
      ZONE_DRAW_TIMEOUT_MS,
    );

    void (async () => {
      try {
        unDrawn = await listen<DrawnRect>("zones://drawn", (e) => {
          finish(e.payload, false);
        });
        unCancel = await listen("zones://draw-cancel", () => {
          finish(null, false);
        });
        await invoke("begin_zone_overlay_draw");
      } catch {
        finish(null, true);
      }
    })();
  });
}

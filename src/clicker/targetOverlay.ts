import { invoke } from "@tauri-apps/api/core";
import type { ClickPoint, ScreenGeomDto } from "./clickerTypes";

export type TargetOverlayMode = "cursor" | "fixed" | "sequence";

export type TargetOverlayState = {
  geom: ScreenGeomDto;
  mode: TargetOverlayMode;
  fixed?: { x: number; y: number } | null;
  points?: ClickPoint[];
};

export async function setTargetOverlayVisible(visible: boolean) {
  await invoke("set_target_overlay_visible", { visible });
}

export async function pushTargetOverlayState(state: TargetOverlayState) {
  await invoke("push_target_overlay_state", {
    geom: state.geom,
    mode: state.mode,
    fixed: state.fixed ?? null,
    points: state.points ?? [],
  });
}

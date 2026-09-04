import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type PickedPoint = { x: number; y: number };

/** Opens the fullscreen pick overlay; resolves null if cancelled (Esc). */
export async function pickScreenPoint(): Promise<PickedPoint | null> {
  return new Promise((resolve) => {
    let settled = false;
    let unResult: (() => void) | undefined;
    let unCancel: (() => void) | undefined;

    const cleanup = () => {
      unResult?.();
      unCancel?.();
    };

    const finish = (value: PickedPoint | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    void (async () => {
      try {
        // Attach listeners before showing the overlay to avoid missing a fast cancel/result.
        unResult = await listen<PickedPoint>("picker://result", (e) => {
          finish(e.payload);
        });
        unCancel = await listen("picker://cancel", () => {
          finish(null);
        });
        await invoke("show_screen_picker");
      } catch {
        finish(null);
      }
    })();
  });
}

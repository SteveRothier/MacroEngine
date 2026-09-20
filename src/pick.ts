import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type PickedPoint = { x: number; y: number };

export type PickScreenResult =
  | { ok: true; point: PickedPoint }
  | { ok: false; reason: "cancel" | "timeout" | "error" };

const PICK_TIMEOUT_MS = 15_000;

/** Opens the fullscreen pick overlay. */
export async function pickScreenPoint(): Promise<PickedPoint | null> {
  const result = await pickScreenPointDetailed();
  return result.ok ? result.point : null;
}

/** Like pickScreenPoint but distinguishes cancel vs timeout vs error. */
export async function pickScreenPointDetailed(): Promise<PickScreenResult> {
  return new Promise((resolve) => {
    let settled = false;
    let unResult: (() => void) | undefined;
    let unCancel: (() => void) | undefined;
    let timer: number | undefined;

    const cleanup = () => {
      if (timer != null) window.clearTimeout(timer);
      unResult?.();
      unCancel?.();
    };

    const finish = (result: PickScreenResult, releaseBackend: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (releaseBackend) {
        void invoke("cancel_screen_pick").catch(() => {});
      }
      resolve(result);
    };

    timer = window.setTimeout(
      () => finish({ ok: false, reason: "timeout" }, true),
      PICK_TIMEOUT_MS,
    );

    void (async () => {
      try {
        // Attach listeners before showing the overlay to avoid missing a fast cancel/result.
        unResult = await listen<PickedPoint>("picker://result", (e) => {
          finish({ ok: true, point: e.payload }, false);
        });
        unCancel = await listen("picker://cancel", () => {
          finish({ ok: false, reason: "cancel" }, false);
        });
        await invoke("show_screen_picker");
      } catch {
        finish({ ok: false, reason: "error" }, true);
      }
    })();
  });
}

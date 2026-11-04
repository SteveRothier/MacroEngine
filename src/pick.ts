import { invoke } from "@tauri-apps/api/core";

export type PickedPoint = { x: number; y: number };

export type PickScreenResult =
  | { ok: true; point: PickedPoint }
  | { ok: false; reason: "cancel" | "timeout" | "error" };

type PixelCaptureState = {
  active: boolean;
  cancelled: boolean;
  sample: { x: number; y: number; r: number; g: number; b: number } | null;
};

export type PixelPickPreview = {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
} | null;

/** Poll cadence for cursor preview + capture state (no native marker). */
const POLL_MS = 32;
const PREVIEW_MS = 100;
const TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** Esc (capture phase) → cancel in-flight pick. */
function bindEscToCancel(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    void cancelScreenPick();
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}

/** Cancel an in-flight pixel/screen pick (Esc / clic droit natif). */
export async function cancelScreenPick(): Promise<void> {
  try {
    await invoke("stop_pixel_color_capture");
  } catch {
    /* ignore */
  }
}

/**
 * One-shot screen point pick for macro click XY (banner only — **no** blue
 * target marker; that overlay is reserved for clicker targets).
 * - anti-crash pixel capture (WH_MOUSE_LL start/poll/stop)
 * - Esc = annuler · clic droit = arrêter · clic gauche = valider
 */
export async function pickScreenPointDetailed(
  onPreview?: (preview: PixelPickPreview) => void,
): Promise<PickScreenResult> {
  let started = false;
  const unbindEsc = bindEscToCancel();
  try {
    await invoke("start_pixel_color_capture");
    started = true;

    let pos = { x: 0, y: 0 };
    try {
      pos = await invoke<{ x: number; y: number }>("get_cursor_position");
      onPreview?.({ x: pos.x, y: pos.y, r: 0, g: 0, b: 0 });
    } catch {
      /* preview best-effort */
    }

    const deadline = Date.now() + TIMEOUT_MS;
    let lastPreviewAt = 0;
    let inflightPreview = false;

    while (Date.now() < deadline) {
      await sleep(POLL_MS);

      try {
        pos = await invoke<{ x: number; y: number }>("get_cursor_position");
      } catch {
        /* keep last */
      }

      const now = Date.now();
      if (onPreview && !inflightPreview && now - lastPreviewAt >= PREVIEW_MS) {
        lastPreviewAt = now;
        inflightPreview = true;
        const px = pos.x;
        const py = pos.y;
        // Coords for banner; color optional (point pick usually ignores RGB).
        void invoke<{ r: number; g: number; b: number }>("read_pixel", {
          x: px,
          y: py,
        })
          .then((sample) => {
            onPreview({
              x: px,
              y: py,
              r: sample.r,
              g: sample.g,
              b: sample.b,
            });
          })
          .catch(() => {
            onPreview({ x: px, y: py, r: 0, g: 0, b: 0 });
          })
          .finally(() => {
            inflightPreview = false;
          });
      }

      const state = await invoke<PixelCaptureState>(
        "get_pixel_color_capture_state",
      );
      if (!state.active) {
        const cancelled = state.cancelled;
        const sample = await invoke<PixelCaptureState["sample"]>(
          "stop_pixel_color_capture",
        ).catch(() => state.sample);
        started = false;
        onPreview?.(null);
        if (cancelled || !sample) {
          return { ok: false, reason: "cancel" };
        }
        return {
          ok: true,
          point: { x: sample.x, y: sample.y },
        };
      }
    }

    await invoke("stop_pixel_color_capture").catch(() => null);
    started = false;
    onPreview?.(null);
    return { ok: false, reason: "timeout" };
  } catch {
    if (started) {
      await invoke("stop_pixel_color_capture").catch(() => null);
    }
    onPreview?.(null);
    return { ok: false, reason: "error" };
  } finally {
    unbindEsc();
  }
}

export async function pickScreenPoint(): Promise<PickedPoint | null> {
  const r = await pickScreenPointDetailed();
  return r.ok ? r.point : null;
}

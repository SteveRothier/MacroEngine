export type PickedPoint = { x: number; y: number };

export type PickScreenResult =
  | { ok: true; point: PickedPoint }
  | { ok: false; reason: "cancel" | "timeout" | "error" };

/**
 * Screen-pick overlay path is disabled (WebView2 / native pick freezes the UI).
 * Callers should use Capture or manual coordinates instead.
 */
export async function pickScreenPoint(): Promise<PickedPoint | null> {
  return null;
}

/** Always cancels — pick-on-screen UI entry points have been removed. */
export async function pickScreenPointDetailed(): Promise<PickScreenResult> {
  return { ok: false, reason: "cancel" };
}

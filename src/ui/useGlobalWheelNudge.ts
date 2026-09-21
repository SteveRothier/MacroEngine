import { useEffect, useRef } from "react";

export function wheelStepFromFlags(altKey: boolean, shiftKey: boolean) {
  return altKey ? 1 : shiftKey ? 10 : 1;
}

export function wheelDeltaFromEvent(ev: {
  altKey: boolean;
  shiftKey: boolean;
  deltaY: number;
}) {
  const step = wheelStepFromFlags(ev.altKey, ev.shiftKey);
  return ev.deltaY < 0 ? step : -step;
}

/**
 * While `active`, capture wheel on the window so the user can nudge a value
 * without hovering the focused number input.
 */
export function useGlobalWheelNudge(
  active: boolean,
  onNudge: (delta: number, ev: WheelEvent) => void,
) {
  const onNudgeRef = useRef(onNudge);
  onNudgeRef.current = onNudge;

  useEffect(() => {
    if (!active) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      onNudgeRef.current(wheelDeltaFromEvent(ev), ev);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [active]);
}

import { useCallback, useState } from "react";

export type ContextMenuPoint = { x: number; y: number };

export type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  openAt: (x: number, y: number) => void;
  openFromEvent: (e: { clientX: number; clientY: number; preventDefault: () => void }) => void;
  close: () => void;
};

/** Shared open-at / Escape-friendly state for ContextMenu portals. */
export function useContextMenuState(
  initial: ContextMenuPoint = { x: 0, y: 0 },
): ContextMenuState {
  const [open, setOpen] = useState(false);
  const [x, setX] = useState(initial.x);
  const [y, setY] = useState(initial.y);

  const close = useCallback(() => setOpen(false), []);

  const openAt = useCallback((nx: number, ny: number) => {
    setX(nx);
    setY(ny);
    setOpen(true);
  }, []);

  const openFromEvent = useCallback(
    (e: { clientX: number; clientY: number; preventDefault: () => void }) => {
      e.preventDefault();
      openAt(e.clientX, e.clientY);
    },
    [openAt],
  );

  return { open, x, y, openAt, openFromEvent, close };
}

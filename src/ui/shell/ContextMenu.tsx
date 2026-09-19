import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MenuItemsList, isPortaledSubmenuTarget, type MenuItemDef } from "./MenuItemsList";

export type ContextMenuItem = MenuItemDef;

type Props = {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
  ariaLabel?: string;
};

const VIEWPORT_PAD = 8;

function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } {
  const maxLeft = Math.max(VIEWPORT_PAD, window.innerWidth - VIEWPORT_PAD - width);
  const maxTop = Math.max(VIEWPORT_PAD, window.innerHeight - VIEWPORT_PAD - height);
  return {
    left: Math.min(Math.max(x, VIEWPORT_PAD), maxLeft),
    top: Math.min(Math.max(y, VIEWPORT_PAD), maxTop),
  };
}

export function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
  onSelect,
  ariaLabel = "Menu contextuel",
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!open || !el) return;
    el.style.visibility = "hidden";
    const { width, height } = el.getBoundingClientRect();
    const { left, top } = clampPosition(x, y, width, height);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [open, x, y, items]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (isPortaledSubmenuTarget(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || items.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="caster-context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={{ left: x, top: y, visibility: "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItemsList
        items={items}
        onItemSelect={(item) => {
          if (item.submenu && item.submenu.length > 0) return;
          onSelect(item.id);
          onClose();
        }}
      />
    </div>,
    document.body,
  );
}

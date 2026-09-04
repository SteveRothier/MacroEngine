import { useEffect, useRef } from "react";
import { MoreHorizontal, Play, Trash2 } from "lucide-react";
import { Tooltip } from "../ui/v2/Tooltip";
import type { AutomationRow } from "./types";

type Props = {
  row: AutomationRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: () => void;
  onLaunch: () => void;
  onDelete: () => void;
};

export function AutomationRowMenu({
  row,
  open,
  onOpenChange,
  onOpen,
  onLaunch,
  onDelete,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="v2-auto-row-menu-wrap" ref={wrapRef}>
      <Tooltip content="Plus d'actions">
        <button
          ref={triggerRef}
          type="button"
          className="v2-auto-row-menu-btn"
          aria-label="Plus d'actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(ev) => {
            ev.stopPropagation();
            onOpenChange(!open);
          }}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </Tooltip>
      {open ? (
        <div
          className="v2-menu-popover v2-auto-row-menu"
          role="menu"
          aria-label={`Actions pour ${row.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="v2-menu-item"
            onClick={() => {
              onOpenChange(false);
              onOpen();
            }}
          >
            Ouvrir
          </button>
          <button
            type="button"
            role="menuitem"
            className="v2-menu-item"
            onClick={() => {
              onOpenChange(false);
              onLaunch();
            }}
          >
            <Play size={12} aria-hidden />
            Lancer
          </button>
          <div className="v2-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="v2-menu-item v2-menu-item--danger"
            onClick={() => {
              onOpenChange(false);
              onDelete();
            }}
          >
            <Trash2 size={12} aria-hidden />
            Supprimer
          </button>
        </div>
      ) : null}
    </div>
  );
}

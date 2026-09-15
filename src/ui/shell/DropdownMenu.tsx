/**
 * Menu d’actions ancré (trigger + portal).
 * Canon UI : caster-menu-popover + MenuItemsList (même look que ContextMenu).
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MenuItemsList, type MenuItemDef } from "./MenuItemsList";

export type DropdownItem = MenuItemDef;

export type DropdownGroup = {
  id: string;
  label: string;
  items: DropdownItem[];
};

export type DropdownEntry = DropdownItem | DropdownGroup;

type Props = {
  items: DropdownEntry[];
  /** Accessible / default button text when `children` is omitted */
  label?: string;
  /** Button contents (icons, etc.). Defaults to `label`. */
  children?: ReactNode;
  disabled?: boolean;
  triggerClassName?: string;
  menuClassName?: string;
  align?: "start" | "end";
  ariaLabel?: string;
  /** Controlled open (omit for uncontrolled) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Stop click bubbling (row menus in tables) */
  stopTriggerPropagation?: boolean;
};

function isGroup(entry: DropdownEntry): entry is DropdownGroup {
  return "items" in entry && Array.isArray((entry as DropdownGroup).items);
}

const MENU_GAP = 6;
const MENU_PAD = 8;

function placeMenu(
  trigger: DOMRect,
  menu: DOMRect,
  align: "start" | "end",
): { top: number; left: number; origin: string } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = align === "end" ? trigger.right - menu.width : trigger.left;
  if (left + menu.width > vw - MENU_PAD) {
    left = trigger.right - menu.width;
  }
  left = Math.max(MENU_PAD, Math.min(left, vw - MENU_PAD - menu.width));

  let top = trigger.bottom + MENU_GAP;
  let origin = "top left";
  if (top + menu.height > vh - MENU_PAD) {
    const above = trigger.top - MENU_GAP - menu.height;
    if (above >= MENU_PAD) {
      top = above;
      origin = "bottom left";
    } else {
      top = Math.max(MENU_PAD, vh - MENU_PAD - menu.height);
    }
  }
  if (left + menu.width / 2 < trigger.left + trigger.width / 2) {
    origin = origin.replace("left", "right");
  }
  return { top, left, origin };
}

function flattenEntries(entries: DropdownEntry[]): {
  list: MenuItemDef[];
  selectableIndices: number[];
} {
  const list: MenuItemDef[] = [];
  const selectableIndices: number[] = [];
  let groupCount = 0;

  for (const entry of entries) {
    if (isGroup(entry)) {
      if (groupCount > 0) {
        list.push({ id: `sep-before-${entry.id}`, label: "", separator: true });
      }
      list.push({
        id: `g-${entry.id}`,
        label: entry.label,
        groupHeader: true,
      });
      for (const item of entry.items) {
        if (item.separator) {
          list.push(item);
        } else {
          selectableIndices.push(list.length);
          list.push(item);
        }
      }
      groupCount += 1;
    } else if (entry.separator) {
      list.push(entry);
    } else if (entry.groupHeader) {
      list.push(entry);
    } else {
      selectableIndices.push(list.length);
      list.push(entry);
    }
  }
  return { list, selectableIndices };
}

export function DropdownMenu({
  items,
  label = "Menu",
  children,
  disabled,
  triggerClassName,
  menuClassName,
  align = "start",
  ariaLabel,
  open: openProp,
  onOpenChange,
  stopTriggerPropagation,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (!controlled) setUncontrolledOpen(value);
    onOpenChange?.(value);
  };
  const [activeSel, setActiveSel] = useState(0);
  const [coords, setCoords] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const { list, selectableIndices } = useMemo(
    () => flattenEntries(items),
    [items],
  );

  const activeIdx =
    selectableIndices[activeSel] ?? selectableIndices[0] ?? -1;

  useEffect(() => {
    if (!open) setActiveSel(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const tEl = triggerRef.current;
    const panel = panelRef.current;
    if (!tEl || !panel) return;

    const update = () => {
      const t = tEl.getBoundingClientRect();
      const m = panel.getBoundingClientRect();
      const { top, left, origin } = placeMenu(t, m, align);
      setCoords({
        position: "fixed",
        top,
        left,
        right: "auto",
        transformOrigin: origin,
        zIndex: 12000,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, list.length, align]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
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
  }, [open]);

  function pick(item: MenuItemDef) {
    if (item.submenu && item.submenu.length > 0) return;
    setOpen(false);
    item.onSelect?.();
  }

  function onListKeyDown(e: ReactKeyboardEvent) {
    const max = Math.max(0, selectableIndices.length - 1);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSel((i) => Math.min(i + 1, max));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSel((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const listIdx = selectableIndices[activeSel];
      const hit = listIdx != null ? list[listIdx] : undefined;
      if (hit && !hit.disabled) pick(hit);
    }
  }

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel ?? (typeof label === "string" ? label : "Menu")}
          className={["caster-menu-popover", menuClassName].filter(Boolean).join(" ")}
          style={coords ?? { position: "fixed", visibility: "hidden" }}
          onKeyDown={onListKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItemsList
            items={list}
            activeIdx={activeIdx}
            onItemHover={(idx) => {
              const sel = selectableIndices.indexOf(idx);
              if (sel >= 0) setActiveSel(sel);
            }}
            onItemSelect={pick}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="caster-dropdown-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          triggerClassName ?? "caster-btn caster-btn-ghost caster-dropdown-menu-trigger"
        }
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={(e) => {
          if (stopTriggerPropagation) e.stopPropagation();
          setOpen(!open);
        }}
      >
        {children ?? label}
      </button>
      {panel}
    </div>
  );
}

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

export type ActionPickerItem = {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  hint?: string;
};

export type ActionPickerGroup = {
  id: string;
  label: string;
  items: ActionPickerItem[];
};

export type ActionPickerEntry = ActionPickerItem | ActionPickerGroup;

type Props = {
  label?: string;
  disabled?: boolean;
  items: ActionPickerEntry[];
  /** Extra class on the trigger button */
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function isGroup(entry: ActionPickerEntry): entry is ActionPickerGroup {
  return "items" in entry;
}

const MENU_GAP = 6;
const MENU_PAD = 8;

function placeMenu(
  trigger: DOMRect,
  menu: DOMRect,
): { top: number; left: number; origin: string } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = trigger.left;
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

function flattenVisible(
  entries: ActionPickerEntry[],
  query: string,
): { groupLabel: string | null; item: ActionPickerItem }[] {
  const q = query.trim().toLowerCase();
  const out: { groupLabel: string | null; item: ActionPickerItem }[] = [];
  for (const entry of entries) {
    if (isGroup(entry)) {
      for (const item of entry.items) {
        const hay = `${entry.label} ${item.label} ${item.hint ?? ""}`.toLowerCase();
        if (!q || hay.includes(q)) {
          out.push({ groupLabel: entry.label, item });
        }
      }
    } else {
      const hay = `${entry.label} ${entry.hint ?? ""}`.toLowerCase();
      if (!q || hay.includes(q)) {
        out.push({ groupLabel: null, item: entry });
      }
    }
  }
  return out;
}

export function ActionPickerMenu({
  label = "+ Ajouter",
  disabled,
  items,
  triggerClassName,
  open: openProp,
  onOpenChange,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? Boolean(openProp) : uncontrolledOpen;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (!controlled) setUncontrolledOpen(value);
    onOpenChange?.(value);
  };
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [coords, setCoords] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  const flat = useMemo(() => flattenVisible(items, query), [items, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const update = () => {
      const t = trigger.getBoundingClientRect();
      const m = panel.getBoundingClientRect();
      const { top, left, origin } = placeMenu(t, m);
      setCoords({
        position: "fixed",
        top,
        left,
        right: "auto",
        transformOrigin: origin,
        zIndex: 80,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, flat.length, query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

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
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(item: ActionPickerItem) {
    setOpen(false);
    item.onSelect();
  }

  function onListKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[activeIdx];
      if (hit) pick(hit.item);
    }
  }

  let lastGroup: string | null = null;
  const panel = open
    ? createPortal(
        <div
          className="v2-menu-popover v2-action-picker"
          id={menuId}
          role="menu"
          ref={panelRef}
          style={coords ?? { position: "fixed", visibility: "hidden" }}
          onKeyDown={onListKeyDown}
        >
          <div className="v2-action-picker-search">
            <input
              ref={inputRef}
              type="search"
              className="v2-action-picker-input"
              placeholder="Filtrer les actions…"
              value={query}
              aria-label="Filtrer les actions"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onListKeyDown}
            />
          </div>
          <div className="v2-action-picker-list">
            {flat.length === 0 ? (
              <p className="v2-action-picker-empty">Aucune action</p>
            ) : (
              flat.map((row, idx) => {
                const showGroup =
                  row.groupLabel != null && row.groupLabel !== lastGroup;
                const showSep =
                  showGroup && lastGroup != null && row.groupLabel != null;
                if (row.groupLabel) lastGroup = row.groupLabel;
                return (
                  <div key={`${row.item.id}-${idx}`}>
                    {showSep ? (
                      <div className="v2-menu-separator" role="separator" />
                    ) : null}
                    {showGroup && row.groupLabel ? (
                      <div className="v2-action-picker-group-label">
                        {row.groupLabel}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className={[
                        "v2-menu-item",
                        "v2-action-picker-item",
                        idx === activeIdx ? "is-active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => pick(row.item)}
                    >
                      {row.item.icon ? (
                        <span className="v2-menu-item-icon" aria-hidden>
                          {row.item.icon}
                        </span>
                      ) : null}
                      <span className="v2-action-picker-item-text">
                        <span className="v2-menu-item-label">
                          {row.item.label}
                        </span>
                        {row.item.hint ? (
                          <span className="v2-action-picker-item-hint">
                            {row.item.hint}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="v2-action-picker-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          triggerClassName ??
          "v2-btn v2-btn-ghost v2-action-picker-trigger"
        }
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {panel}
    </div>
  );
}

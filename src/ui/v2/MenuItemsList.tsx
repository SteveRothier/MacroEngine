import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight } from "lucide-react";

/** Shared item shape for ContextMenu + DropdownMenu. */
export type MenuItemDef = {
  id: string;
  label: string;
  /** Optional secondary line under the label (e.g. Créer menu). */
  description?: string;
  /** Optional keyboard hint shown on the right. */
  shortcut?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  /** Render as section header (not selectable). */
  groupHeader?: boolean;
  /** Nested flyout items (hover / focus). */
  submenu?: MenuItemDef[];
  onSelect?: () => void;
};

/** Depth-first lookup including submenu leaves. */
export function findMenuItem(
  items: MenuItemDef[],
  id: string,
): MenuItemDef | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.submenu) {
      const hit = findMenuItem(item.submenu, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

type Props = {
  items: MenuItemDef[];
  activeIdx?: number;
  onItemSelect: (item: MenuItemDef) => void;
  onItemHover?: (index: number) => void;
};

const VIEWPORT_PAD = 8;
const SUBMENU_GAP_PX = 6;
const PARENT_MENU_SEL =
  ".v2-context-menu, .v2-menu-popover, .v2-menu-submenu";

/** Flat list of v2-menu-item rows (separators + optional icons + submenu flyouts). */
export function MenuItemsList({
  items,
  activeIdx,
  onItemSelect,
  onItemHover,
}: Props) {
  const [openSubId, setOpenSubId] = useState<string | null>(null);

  return (
    <>
      {items.map((item, idx) => {
        if (item.separator) {
          return (
            <div key={item.id} className="v2-menu-separator" role="separator" />
          );
        }
        if (item.groupHeader) {
          return (
            <div key={item.id} className="v2-action-picker-group-label">
              {item.label}
            </div>
          );
        }

        const hasSub = Boolean(item.submenu && item.submenu.length > 0);

        if (hasSub) {
          return (
            <SubmenuRow
              key={item.id}
              item={item}
              active={activeIdx === idx || openSubId === item.id}
              open={openSubId === item.id}
              onOpen={() => {
                setOpenSubId(item.id);
                onItemHover?.(idx);
              }}
              onClose={() =>
                setOpenSubId((cur) => (cur === item.id ? null : cur))
              }
              onItemSelect={onItemSelect}
            />
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={[
              "v2-menu-item",
              item.description ? "v2-menu-item--rich" : "",
              item.danger ? "v2-menu-item--danger" : "",
              activeIdx === idx ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={item.disabled}
            onMouseEnter={() => {
              setOpenSubId(null);
              onItemHover?.(idx);
            }}
            onClick={() => {
              if (item.disabled) return;
              onItemSelect(item);
            }}
          >
            {item.icon ? (
              <span className="v2-menu-item-icon" aria-hidden>
                {item.icon}
              </span>
            ) : null}
            <span className="v2-menu-item-text">
              <span className="v2-menu-item-label">{item.label}</span>
              {item.description ? (
                <span className="v2-menu-item-desc">{item.description}</span>
              ) : null}
            </span>
            {item.shortcut ? (
              <span className="v2-menu-item-shortcut" aria-hidden>
                {item.shortcut}
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

function SubmenuRow({
  item,
  active,
  open,
  onOpen,
  onClose,
  onItemSelect,
}: {
  item: MenuItemDef;
  active: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onItemSelect: (item: MenuItemDef) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  function clearCloseTimer() {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => onClose(), 120);
  }

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !flyoutRef.current) return;

    const wrapEl = wrapRef.current;
    const fly = flyoutRef.current;
    const wrap = wrapEl.getBoundingClientRect();
    const menuEl = wrapEl.closest(PARENT_MENU_SEL);
    const menu = (menuEl ?? wrapEl).getBoundingClientRect();

    fly.style.visibility = "hidden";
    fly.style.left = "0";
    fly.style.right = "auto";
    fly.style.top = "0";
    fly.style.marginLeft = "0";
    fly.style.marginRight = "0";
    fly.style.width = `${menu.width}px`;
    fly.style.minWidth = `${menu.width}px`;
    fly.style.maxWidth = `${menu.width}px`;

    const height = fly.getBoundingClientRect().height;
    const width = menu.width;
    const btn = (btnRef.current ?? wrapEl).getBoundingClientRect();

    let placeLeft = false;
    let left = menu.right - wrap.left + SUBMENU_GAP_PX;
    const spaceRight = window.innerWidth - menu.right - VIEWPORT_PAD;
    if (spaceRight < width + SUBMENU_GAP_PX) {
      placeLeft = true;
      left = menu.left - wrap.left - width - SUBMENU_GAP_PX;
    }

    // Align top with the parent option row (not the whole menu panel).
    let top = btn.top - wrap.top;
    const absBottom = btn.top + height;
    const overflow = absBottom - (window.innerHeight - VIEWPORT_PAD);
    if (overflow > 0) {
      top -= overflow;
    }

    fly.style.left = `${left}px`;
    fly.style.top = `${top}px`;
    fly.style.visibility = "visible";

    const bridge = bridgeRef.current;
    if (bridge) {
      const gap = placeLeft
        ? Math.max(0, wrap.left - (menu.left - SUBMENU_GAP_PX))
        : Math.max(0, menu.right + SUBMENU_GAP_PX - wrap.right);
      bridge.style.top = "0";
      bridge.style.height = `${Math.max(wrap.height, btn.height)}px`;
      bridge.style.width = `${Math.max(gap, SUBMENU_GAP_PX + 2)}px`;
      if (placeLeft) {
        bridge.style.left = "auto";
        bridge.style.right = "100%";
      } else {
        bridge.style.left = "100%";
        bridge.style.right = "auto";
      }
    }
  }, [open, item.submenu]);

  return (
    <div
      ref={wrapRef}
      className="v2-menu-item-submenu-wrap"
      onMouseEnter={() => {
        clearCloseTimer();
        if (!item.disabled) onOpen();
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={btnRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          "v2-menu-item",
          "v2-menu-item--submenu",
          item.description ? "v2-menu-item--rich" : "",
          active || open ? "is-active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={item.disabled}
        onClick={(e) => {
          e.preventDefault();
          if (item.disabled) return;
          onOpen();
        }}
      >
        {item.icon ? (
          <span className="v2-menu-item-icon" aria-hidden>
            {item.icon}
          </span>
        ) : null}
        <span className="v2-menu-item-text">
          <span className="v2-menu-item-label">{item.label}</span>
        </span>
        <span className="v2-menu-item-chevron" aria-hidden>
          <ChevronRight size={14} />
        </span>
      </button>
      {open ? (
        <div
          ref={bridgeRef}
          className="v2-menu-submenu-bridge"
          aria-hidden
        />
      ) : null}
      {open && item.submenu ? (
        <div
          ref={flyoutRef}
          className="v2-menu-submenu"
          role="menu"
          style={{ visibility: "hidden" }}
          onMouseEnter={clearCloseTimer}
          onContextMenu={(e) => e.preventDefault()}
        >
          <MenuItemsList items={item.submenu} onItemSelect={onItemSelect} />
        </div>
      ) : null}
    </div>
  );
}

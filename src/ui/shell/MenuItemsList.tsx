import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  /** Inline filter field (not selectable). */
  filter?: {
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
  };
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
  ".caster-context-menu, .caster-menu-popover, .caster-menu-submenu";
const PORTAL_SUBMENU_SEL =
  ".caster-menu-submenu--portal, .caster-menu-submenu-bridge--portal";

/** True when the event target is inside a portaled submenu flyout/bridge. */
export function isPortaledSubmenuTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(PORTAL_SUBMENU_SEL));
}

/** Flat list of caster-menu-item rows (separators + optional icons + submenu flyouts). */
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
            <div key={item.id} className="caster-menu-separator" role="separator" />
          );
        }
        if (item.groupHeader) {
          return (
            <div key={item.id} className="caster-action-picker-group-label">
              {item.label}
            </div>
          );
        }
        if (item.filter) {
          return (
            <div
              key={item.id}
              className="caster-menu-filter"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                type="search"
                className="caster-menu-filter-input"
                value={item.filter.value}
                placeholder={item.filter.placeholder}
                aria-label={item.filter.placeholder ?? item.label}
                onChange={(e) => item.filter?.onChange(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
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
              "caster-menu-item",
              item.description ? "caster-menu-item--rich" : "",
              item.danger ? "caster-menu-item--danger" : "",
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
              <span className="caster-menu-item-icon" aria-hidden>
                {item.icon}
              </span>
            ) : null}
            <span className="caster-menu-item-text">
              <span className="caster-menu-item-label">{item.label}</span>
              {item.description ? (
                <span className="caster-menu-item-desc">{item.description}</span>
              ) : null}
            </span>
            {item.shortcut ? (
              <span className="caster-menu-item-shortcut" aria-hidden>
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
    const menuEl = wrapEl.closest(PARENT_MENU_SEL);
    const menu = (menuEl ?? wrapEl).getBoundingClientRect();
    const btn = (btnRef.current ?? wrapEl).getBoundingClientRect();

    fly.style.visibility = "hidden";
    fly.style.position = "fixed";
    fly.style.left = "0";
    fly.style.right = "auto";
    fly.style.top = "0";
    fly.style.width = `${menu.width}px`;
    fly.style.minWidth = `${menu.width}px`;
    fly.style.maxWidth = `${menu.width}px`;

    const height = fly.getBoundingClientRect().height;
    const width = menu.width;

    let placeLeft = false;
    let left = menu.right + SUBMENU_GAP_PX;
    const spaceRight = window.innerWidth - menu.right - VIEWPORT_PAD;
    if (spaceRight < width + SUBMENU_GAP_PX) {
      placeLeft = true;
      left = menu.left - width - SUBMENU_GAP_PX;
    }

    // Align top with the parent option row; clamp to viewport.
    let top = btn.top;
    const overflow = btn.top + height - (window.innerHeight - VIEWPORT_PAD);
    if (overflow > 0) {
      top -= overflow;
    }
    if (top < VIEWPORT_PAD) {
      top = VIEWPORT_PAD;
    }

    fly.style.left = `${left}px`;
    fly.style.top = `${top}px`;
    fly.style.visibility = "visible";

    const bridge = bridgeRef.current;
    if (bridge) {
      const gapW = Math.max(SUBMENU_GAP_PX + 2, SUBMENU_GAP_PX);
      const bridgeTop = Math.min(btn.top, top);
      const bridgeBottom = Math.max(btn.bottom, top + height);
      bridge.style.position = "fixed";
      bridge.style.top = `${bridgeTop}px`;
      bridge.style.height = `${Math.max(bridgeBottom - bridgeTop, btn.height)}px`;
      bridge.style.width = `${gapW}px`;
      if (placeLeft) {
        bridge.style.left = `${left + width}px`;
      } else {
        bridge.style.left = `${menu.right}px`;
      }
      bridge.style.right = "auto";
    }
  }, [open, item.submenu]);

  const portal =
    open && item.submenu
      ? createPortal(
          <>
            <div
              ref={bridgeRef}
              className="caster-menu-submenu-bridge caster-menu-submenu-bridge--portal"
              aria-hidden
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
            />
            <div
              ref={flyoutRef}
              className="caster-menu-submenu caster-menu-submenu--portal"
              role="menu"
              style={{ visibility: "hidden" }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
              onContextMenu={(e) => e.preventDefault()}
            >
              <MenuItemsList items={item.submenu} onItemSelect={onItemSelect} />
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div
      ref={wrapRef}
      className="caster-menu-item-submenu-wrap"
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
          "caster-menu-item",
          "caster-menu-item--submenu",
          item.description ? "caster-menu-item--rich" : "",
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
          <span className="caster-menu-item-icon" aria-hidden>
            {item.icon}
          </span>
        ) : null}
        <span className="caster-menu-item-text">
          <span className="caster-menu-item-label">{item.label}</span>
        </span>
        <span className="caster-menu-item-chevron" aria-hidden>
          <ChevronRight size={14} />
        </span>
      </button>
      {portal}
    </div>
  );
}

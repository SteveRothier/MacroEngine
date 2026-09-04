import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export type SidebarItem = {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

type Props = {
  items: SidebarItem[];
  bottomItems?: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  recent?: { id: string; label: string; onClick: () => void }[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

const SIDEBAR_EXPANDED_PX = 220;
const SIDEBAR_COLLAPSED_PX = 56;
const SIDEBAR_ANIM_MS = 380;

function NavItem({
  item,
  active,
  railMode,
  onSelect,
}: {
  item: SidebarItem;
  active: boolean;
  railMode: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={["v2-sidebar-item", active ? "active" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
      title={railMode ? item.label : undefined}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
    >
      <span className="v2-sidebar-icon">{item.icon}</span>
      {!railMode ? (
        <>
          <span className="v2-sidebar-label">{item.label}</span>
          {item.badge != null && item.badge > 0 ? (
            <span className="v2-sidebar-badge">{item.badge}</span>
          ) : null}
        </>
      ) : null}
    </button>
  );
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function setShellWidth(el: HTMLElement, px: number) {
  const v = `${Math.round(px * 10) / 10}px`;
  el.style.width = v;
  el.style.minWidth = v;
  el.style.maxWidth = v;
  document.documentElement.style.setProperty("--v2-sidebar-w", v);
}

function setLabelReveal(el: HTMLElement, widthPx: number) {
  const span = SIDEBAR_EXPANDED_PX - SIDEBAR_COLLAPSED_PX;
  const t = (widthPx - SIDEBAR_COLLAPSED_PX) / span;
  // Fade labels in the first half of expand / last half of collapse
  const opacity = Math.min(1, Math.max(0, (t - 0.08) / 0.5));
  el.style.setProperty("--v2-sidebar-label-opacity", String(opacity));
  el.style.setProperty("--v2-sidebar-label-shift", `${(1 - opacity) * -8}px`);
}

function animateShellWidth(
  el: HTMLElement,
  from: number,
  to: number,
  ms: number,
  onComplete: () => void,
): () => void {
  let raf = 0;
  let cancelled = false;
  const start = performance.now();

  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / ms);
    const w = from + (to - from) * smoothstep(t);
    setShellWidth(el, w);
    setLabelReveal(el, w);
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      setShellWidth(el, to);
      setLabelReveal(el, to);
      onComplete();
    }
  };

  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

export function Sidebar({
  items,
  bottomItems = [],
  activeId,
  onSelect,
  recent,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const shellRef = useRef<HTMLElement>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);
  const animatingRef = useRef(false);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const w = collapsed ? SIDEBAR_COLLAPSED_PX : SIDEBAR_EXPANDED_PX;
    setShellWidth(el, w);
    setLabelReveal(el, w);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only

  useEffect(() => () => cancelAnimRef.current?.(), []);

  const handleToggle = useCallback(() => {
    if (animatingRef.current) return;
    const el = shellRef.current;
    const nextCollapsed = !collapsed;
    const to = nextCollapsed ? SIDEBAR_COLLAPSED_PX : SIDEBAR_EXPANDED_PX;

    cancelAnimRef.current?.();
    cancelAnimRef.current = null;

    if (!el) {
      onToggleCollapse?.();
      return;
    }

    const from = el.getBoundingClientRect().width;
    animatingRef.current = true;

    // Expand: unlock full layout immediately (labels ready to fade in while width grows)
    // Collapse: keep full layout until end so labels clip instead of reflowing
    if (!nextCollapsed) {
      onToggleCollapse?.();
    }

    cancelAnimRef.current = animateShellWidth(el, from, to, SIDEBAR_ANIM_MS, () => {
      animatingRef.current = false;
      cancelAnimRef.current = null;
      if (nextCollapsed) {
        onToggleCollapse?.();
      }
    });
  }, [collapsed, onToggleCollapse]);

  const toggleLabel = collapsed
    ? "Déplier la barre latérale"
    : "Replier la barre latérale";
  const hasRecent = Boolean(recent && recent.length > 0);

  return (
    <aside
      ref={shellRef}
      className={["v2-sidebar", collapsed ? "v2-sidebar--collapsed" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="Navigation"
      aria-expanded={!collapsed}
    >
      <div className="v2-sidebar-inner">
        {onToggleCollapse ? (
          <div className="v2-sidebar-toolbar">
            <button
              type="button"
              className="v2-sidebar-toggle"
              onClick={handleToggle}
              title={toggleLabel}
              aria-label={toggleLabel}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        ) : null}
        <nav className="v2-sidebar-nav">
          {items.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeId === item.id}
              railMode={collapsed}
              onSelect={() => onSelect(item.id)}
            />
          ))}
        </nav>
        {hasRecent ? (
          <div
            className={[
              "v2-sidebar-recent",
              collapsed ? "v2-sidebar-recent--hidden" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden={collapsed}
          >
            <span className="v2-sidebar-recent-head">Récents</span>
            {recent!.slice(0, 5).map((r) => (
              <button
                key={r.id}
                type="button"
                className="v2-sidebar-recent-item"
                onClick={r.onClick}
                title={r.label}
                tabIndex={collapsed ? -1 : undefined}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : null}
        {bottomItems.length > 0 ? (
          <nav className="v2-sidebar-bottom">
            {bottomItems.map((item) => (
              <NavItem
                key={item.id}
                item={item}
                active={activeId === item.id}
                railMode={collapsed}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          </nav>
        ) : null}
      </div>
    </aside>
  );
}

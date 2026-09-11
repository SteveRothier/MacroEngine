import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Code2,
  Copy,
  FolderOpen,
  ListMinus,
  ListX,
  MousePointer2,
  PanelRightClose,
  PenLine,
  Pin,
  PinOff,
  Plus,
  Workflow,
  X,
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { Tooltip } from "./Tooltip";
import { useDocumentTabReorder } from "./useDocumentTabReorder";
import { useTabStripLayoutAnimation } from "./useTabStripLayoutAnimation";
import { HOME_TAB_ID } from "../../app/workspaces";
import { CasterLogo } from "./CasterLogo";

export type DocumentTabItem = {
  id: string;
  label: string;
  kind: "home" | "macro" | "clicker" | "script";
  dirty?: boolean;
  closable?: boolean;
  pinned?: boolean;
};

export type TabContextAction =
  | "close"
  | "closeOthers"
  | "closeToRight"
  | "duplicate"
  | "pin"
  | "unpin"
  | "rename"
  | "reveal";

export type BarContextAction =
  | "createMacro"
  | "createClicker"
  | "createScript"
  | "closeAll";

type Props = {
  tabs: DocumentTabItem[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onCreateMacro?: () => void;
  onCreateClicker?: () => void;
  onCreateScript?: () => void;
  onTabContextAction?: (tabId: string, action: TabContextAction) => void;
  onBarContextAction?: (action: BarContextAction) => void;
  onTabReorder?: (fromTabId: string, insertBeforeTabId: string | null) => void;
  onPinnedCloseAttempt?: () => void;
};

function TabKindIcon({ kind }: { kind: DocumentTabItem["kind"] }) {
  if (kind === "home") return <CasterLogo size={14} variant="glyph" />;
  if (kind === "macro") return <Workflow size={14} aria-hidden />;
  if (kind === "script") return <Code2 size={14} aria-hidden />;
  return <MousePointer2 size={14} aria-hidden />;
}

function TabFace({
  tab,
  compact,
}: {
  tab: DocumentTabItem;
  compact?: boolean;
}) {
  return (
    <>
      <span className="v2-doc-tab-icon">
        <TabKindIcon kind={tab.kind} />
      </span>
      {!compact && tab.kind !== "home" ? (
        <span className="v2-doc-tab-label">{tab.label}</span>
      ) : null}
      {tab.pinned ? (
        <span className="v2-doc-tab-pin" aria-hidden>
          <Pin size={10} />
        </span>
      ) : null}
    </>
  );
}

const MENU_ICON = 14;
const COMPACT_WIDTH = 56;
const TAB_TOOLTIP_CLASS = "v2-tooltip--tab";
const TAB_TOOLTIP_WRAP = "v2-doc-tab-tooltip-wrap";

function tabTooltipText(tab: DocumentTabItem): string {
  if (tab.kind === "home") return "Accueil";
  if (tab.dirty) return `${tab.label} — non enregistré`;
  return tab.label;
}

const HOME_CONTEXT_ITEMS: ContextMenuItem[] = [
  {
    id: "createMacro",
    label: "Nouvelle macro",
    icon: <Workflow size={MENU_ICON} aria-hidden />,
  },
  {
    id: "createClicker",
    label: "Nouveau preset clicker",
    icon: <MousePointer2 size={MENU_ICON} aria-hidden />,
  },
  {
    id: "createScript",
    label: "Nouveau script",
    icon: <Code2 size={MENU_ICON} aria-hidden />,
  },
];

function docTabContextItems(tab: DocumentTabItem): ContextMenuItem[] {
  return [
    { id: "close", label: "Fermer", icon: <X size={MENU_ICON} aria-hidden /> },
    {
      id: "closeOthers",
      label: "Fermer les autres",
      icon: <ListMinus size={MENU_ICON} aria-hidden />,
    },
    {
      id: "closeToRight",
      label: "Fermer à droite",
      icon: <PanelRightClose size={MENU_ICON} aria-hidden />,
    },
    { id: "sep1", label: "", separator: true },
    {
      id: tab.pinned ? "unpin" : "pin",
      label: tab.pinned ? "Désépingler" : "Épingler",
      icon: tab.pinned ? (
        <PinOff size={MENU_ICON} aria-hidden />
      ) : (
        <Pin size={MENU_ICON} aria-hidden />
      ),
    },
    { id: "duplicate", label: "Dupliquer", icon: <Copy size={MENU_ICON} aria-hidden /> },
    { id: "sep2", label: "", separator: true },
    { id: "rename", label: "Renommer", icon: <PenLine size={MENU_ICON} aria-hidden /> },
    {
      id: "reveal",
      label: "Afficher dans l’explorateur",
      icon: <FolderOpen size={MENU_ICON} aria-hidden />,
    },
  ];
}

const barContextItems: ContextMenuItem[] = [
  {
    id: "createMacro",
    label: "Nouvelle macro",
    icon: <Workflow size={MENU_ICON} aria-hidden />,
  },
  {
    id: "createClicker",
    label: "Nouveau preset clicker",
    icon: <MousePointer2 size={MENU_ICON} aria-hidden />,
  },
  {
    id: "createScript",
    label: "Nouveau script",
    icon: <Code2 size={MENU_ICON} aria-hidden />,
  },
  { id: "sep1", label: "", separator: true },
  {
    id: "closeAll",
    label: "Fermer tous les onglets",
    icon: <ListX size={MENU_ICON} aria-hidden />,
  },
];

export { barContextItems as BAR_CONTEXT_MENU_ITEMS };

const CREATE_MENU_ITEMS: ContextMenuItem[] = [
  {
    id: "macro",
    label: "Macro vierge",
    icon: <Workflow size={MENU_ICON} aria-hidden />,
  },
  {
    id: "clicker",
    label: "Preset clicker",
    icon: <MousePointer2 size={MENU_ICON} aria-hidden />,
  },
  {
    id: "script",
    label: "Script",
    icon: <Code2 size={MENU_ICON} aria-hidden />,
  },
];

const TAB_CTX_ACTIONS = new Set<string>([
  "close",
  "closeOthers",
  "closeToRight",
  "duplicate",
  "pin",
  "unpin",
  "rename",
  "reveal",
]);

export function DocumentTabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onCreateMacro,
  onCreateClicker,
  onCreateScript,
  onTabContextAction,
  onBarContextAction,
  onTabReorder,
  onPinnedCloseAttempt,
}: Props) {
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabElsRef = useRef(new Map<string, HTMLDivElement>());

  const [createMenu, setCreateMenu] = useState<{ x: number; y: number } | null>(null);
  const [compactIds, setCompactIds] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{
    kind: "tab" | "bar" | "home";
    tabId?: string;
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const {
    dragUi,
    displayTabs,
    frozenTabWidths,
    ghostElRef,
    canDragTab,
    onTabMainPointerDown,
    consumeClickSuppression,
  } = useDocumentTabReorder({
      tabs,
      tabElsRef,
      scrollRef,
      onTabReorder,
    });

  const scrollTabIds = useMemo(
    () => displayTabs.filter((t) => t.kind !== "home").map((t) => t.id),
    [displayTabs],
  );

  const scrollActiveTabIntoView = useCallback(() => {
    if (activeTabId === HOME_TAB_ID) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const active = scroll.querySelector(".v2-doc-tab.active");
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [activeTabId]);

  const { isLayoutAnimatingRef } = useTabStripLayoutAnimation({
    tabIds: scrollTabIds,
    tabElsRef,
    scrollRef,
    addBtnRef,
    enabled: !dragUi.isDragging,
    onAnimationEnd: scrollActiveTabIntoView,
  });

  const setTabRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) tabElsRef.current.set(id, el);
    else tabElsRef.current.delete(id);
  }, []);

  useEffect(() => {
    if (isLayoutAnimatingRef.current) return;
    scrollActiveTabIntoView();
  }, [activeTabId, displayTabs, scrollActiveTabIntoView, isLayoutAnimatingRef]);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      if (dragUi.isDragging || isLayoutAnimatingRef.current) return;
      setCompactIds((prev) => {
        const next = new Set(prev);
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.tabId;
          if (!id) continue;
          if (entry.contentRect.width < COMPACT_WIDTH) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    });
    tabElsRef.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [displayTabs, dragUi.isDragging, isLayoutAnimatingRef]);

  const toggleCreateMenu = () => {
    if (createMenu) {
      setCreateMenu(null);
      return;
    }
    const rect = addBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCreateMenu({ x: rect.left, y: rect.bottom + 4 });
  };

  const openBarMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      kind: "bar",
      x: e.clientX,
      y: e.clientY,
      items: barContextItems,
    });
  };

  const openTabMenu = (e: ReactMouseEvent, tab: DocumentTabItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (tab.kind === "home") {
      setMenu({
        kind: "home",
        x: e.clientX,
        y: e.clientY,
        items: HOME_CONTEXT_ITEMS,
      });
      return;
    }
    setMenu({
      kind: "tab",
      tabId: tab.id,
      x: e.clientX,
      y: e.clientY,
      items: docTabContextItems(tab),
    });
  };

  const tryCloseTab = (tab: DocumentTabItem) => {
    if (tab.kind === "home") return;
    if (tab.pinned) {
      onPinnedCloseAttempt?.();
      return;
    }
    onClose?.(tab.id);
  };

  const onMenuSelect = (id: string) => {
    if (!menu) return;
    if (menu.kind === "home") {
      if (id === "createMacro") onCreateMacro?.();
      if (id === "createClicker") onCreateClicker?.();
      if (id === "createScript") onCreateScript?.();
      return;
    }
    if (menu.kind === "tab" && menu.tabId && onTabContextAction) {
      if (TAB_CTX_ACTIONS.has(id)) {
        onTabContextAction(menu.tabId, id as TabContextAction);
      }
      return;
    }
    if (menu.kind === "bar" && onBarContextAction) {
      if (
        id === "createMacro" ||
        id === "createClicker" ||
        id === "createScript" ||
        id === "closeAll"
      ) {
        onBarContextAction(id);
      }
    }
  };

  const onCreateMenuSelect = (id: string) => {
    if (id === "macro") onCreateMacro?.();
    if (id === "clicker") onCreateClicker?.();
    if (id === "script") onCreateScript?.();
  };

  const ghost = dragUi.ghost;
  const ghostActive = ghost ? ghost.tab.id === activeTabId : false;
  const ghostCompact = ghost ? compactIds.has(ghost.tab.id) : false;

  useLayoutEffect(() => {
    const el = ghostElRef.current;
    if (!ghost || !el) return;
    el.style.display = "block";
    el.style.width = `${ghost.width}px`;
    el.style.height = `${ghost.height}px`;
  }, [ghost, ghostElRef]);

  const homeTab = displayTabs.find((t) => t.kind === "home");
  const scrollTabs = displayTabs.filter((t) => t.kind !== "home");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const renderDocTab = (tab: DocumentTabItem) => {
    const active = tab.id === activeTabId;
    const compact =
      tab.kind === "home" ||
      (!dragUi.isDragging && compactIds.has(tab.id));
    const closable =
      tab.closable !== false && tab.kind !== "home" && !tab.pinned;
    const isDragSource = dragUi.draggingId === tab.id;
    const draggable = canDragTab(tab);
    const frozenWidth = frozenTabWidths?.[tab.id];

    const tooltipText = tabTooltipText(tab);
    const tooltipProps = {
      side: "bottom" as const,
      align: "start" as const,
      gap: 8,
      delay: 320,
      className: TAB_TOOLTIP_CLASS,
      wrapClassName: TAB_TOOLTIP_WRAP,
    };

    const tabMain = (
      <button
        type="button"
        role="tab"
        className={[
          "v2-doc-tab-main",
          draggable ? "v2-doc-tab-main--draggable" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-selected={active}
        onPointerDown={
          draggable ? (e) => onTabMainPointerDown(tab, e) : undefined
        }
        onClick={() => {
          if (consumeClickSuppression()) return;
          onSelect(tab.id);
        }}
      >
        <TabFace tab={tab} compact={compact} />
      </button>
    );

    return (
      <div
        key={tab.id}
        ref={(el) => setTabRef(tab.id, el)}
        data-tab-id={tab.id}
        role="presentation"
        style={
          frozenWidth != null
            ? {
                flex: tab.kind === "home" ? "0 0 auto" : "none",
                width: frozenWidth,
                minWidth: frozenWidth,
                maxWidth: frozenWidth,
              }
            : undefined
        }
        className={[
          "v2-doc-tab",
          tab.kind === "home" ? "v2-doc-tab--home" : "",
          tab.kind === "macro" ? "v2-doc-tab--macro" : "",
          tab.kind === "clicker" ? "v2-doc-tab--clicker" : "",
          tab.kind === "script" ? "v2-doc-tab--script" : "",
          tab.pinned ? "v2-doc-tab--pinned" : "",
          compact ? "v2-doc-tab--compact" : "",
          isDragSource ? "v2-doc-tab--drag-source" : "",
          active ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onContextMenu={(e) => openTabMenu(e, tab)}
        onAuxClick={(e) => {
          if (e.button !== 1) return;
          e.preventDefault();
          tryCloseTab(tab);
        }}
      >
        <Tooltip
          {...tooltipProps}
          content={tooltipText}
          disabled={dragUi.isDragging || !tooltipText}
        >
          {tabMain}
        </Tooltip>
        {closable && onClose ? (
          <button
            type="button"
            className="v2-doc-tab-close"
            aria-label={`Fermer ${tab.label}`}
            onClick={(e) => {
              e.stopPropagation();
              tryCloseTab(tab);
            }}
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div className="v2-doc-tabbar" onContextMenu={openBarMenu}>
        {homeTab ? (
          <div className="v2-doc-tabbar-home">{renderDocTab(homeTab)}</div>
        ) : null}
        <div
          ref={scrollRef}
          className={[
            "v2-doc-tabbar-scroll",
            dragUi.isDragging ? "is-tab-dragging" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onContextMenu={openBarMenu}
        >
          <div
            className="v2-doc-tabbar-strip"
            role="tablist"
            aria-label="Automations ouvertes"
          >
            {scrollTabs.map((tab) => renderDocTab(tab))}
            <div className="v2-doc-tabbar-add">
              <button
                ref={addBtnRef}
                type="button"
                className="v2-doc-tab-add-btn"
                aria-label="Créer une automation"
                aria-expanded={createMenu != null}
                aria-haspopup="menu"
                onClick={toggleCreateMenu}
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
            <div
              className="v2-doc-tabbar-drag-fill"
              data-tauri-drag-region
              aria-hidden
              onContextMenu={openBarMenu}
            />
          </div>
        </div>
      </div>

      {ghost && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={ghostElRef}
              className={[
                "v2-doc-tab",
                "v2-doc-tab-ghost",
                ghost.tab.kind === "macro" ? "v2-doc-tab--macro" : "",
                ghost.tab.kind === "clicker" ? "v2-doc-tab--clicker" : "",
                ghost.tab.kind === "script" ? "v2-doc-tab--script" : "",
                ghost.tab.pinned ? "v2-doc-tab--pinned" : "",
                ghostCompact ? "v2-doc-tab--compact" : "",
                ghostActive ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ display: "none" }}
            >
              <span className="v2-doc-tab-main v2-doc-tab-main--ghost">
                <TabFace tab={ghost.tab} compact={ghostCompact} />
              </span>
            </div>,
            document.body,
          )
        : null}

      <ContextMenu
        open={createMenu != null}
        x={createMenu?.x ?? 0}
        y={createMenu?.y ?? 0}
        items={CREATE_MENU_ITEMS}
        onClose={() => setCreateMenu(null)}
        onSelect={onCreateMenuSelect}
        ariaLabel="Créer une automation"
      />
      <ContextMenu
        open={menu != null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menu?.items ?? []}
        onClose={() => setMenu(null)}
        onSelect={onMenuSelect}
        ariaLabel={
          menu?.kind === "tab"
            ? "Actions onglet"
            : menu?.kind === "home"
              ? "Actions Accueil"
              : "Actions barre d’onglets"
        }
      />
    </>
  );
}

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
import { invoke } from "@tauri-apps/api/core";
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
import { useT, type TFunction } from "../../i18n";
import type { LibraryIndexDto } from "../../library/types";
import type { QuickAccess, RecentEntry } from "../../quickAccess";
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
  /** Open an existing automation (macro / clicker / script) in a document tab. */
  onOpenExisting?: (
    kind: "macro" | "clicker" | "script",
    id: string,
    label?: string,
  ) => void;
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
      <span className="caster-doc-tab-icon">
        <TabKindIcon kind={tab.kind} />
      </span>
      {!compact && tab.kind !== "home" ? (
        <span className="caster-doc-tab-label">{tab.label}</span>
      ) : null}
      {tab.pinned ? (
        <span className="caster-doc-tab-pin" aria-hidden>
          <Pin size={10} />
        </span>
      ) : null}
    </>
  );
}

const MENU_ICON = 14;
const COMPACT_WIDTH = 56;
const TAB_TOOLTIP_CLASS = "caster-tooltip--tab";
const TAB_TOOLTIP_WRAP = "caster-doc-tab-tooltip-wrap";

function tabTooltipText(tab: DocumentTabItem, t: TFunction): string {
  if (tab.kind === "home") return t("shell.navHome");
  if (tab.dirty) return t("shell.unsavedTab", { label: tab.label });
  return tab.label;
}

function buildHomeContextItems(t: TFunction): ContextMenuItem[] {
  return [
    {
      id: "createMacro",
      label: t("shell.newMacro"),
      icon: <Workflow size={MENU_ICON} aria-hidden />,
    },
    {
      id: "createClicker",
      label: t("shell.newClickerPreset"),
      icon: <MousePointer2 size={MENU_ICON} aria-hidden />,
    },
    {
      id: "createScript",
      label: t("shell.newScript"),
      icon: <Code2 size={MENU_ICON} aria-hidden />,
    },
  ];
}

function buildDocTabContextItems(
  tab: DocumentTabItem,
  t: TFunction,
): ContextMenuItem[] {
  return [
    {
      id: "close",
      label: t("common.close"),
      icon: <X size={MENU_ICON} aria-hidden />,
    },
    {
      id: "closeOthers",
      label: t("shell.closeOthers"),
      icon: <ListMinus size={MENU_ICON} aria-hidden />,
    },
    {
      id: "closeToRight",
      label: t("shell.closeToRight"),
      icon: <PanelRightClose size={MENU_ICON} aria-hidden />,
    },
    { id: "sep1", label: "", separator: true },
    {
      id: tab.pinned ? "unpin" : "pin",
      label: tab.pinned ? t("shell.unpin") : t("shell.pin"),
      icon: tab.pinned ? (
        <PinOff size={MENU_ICON} aria-hidden />
      ) : (
        <Pin size={MENU_ICON} aria-hidden />
      ),
    },
    {
      id: "duplicate",
      label: t("shell.duplicate"),
      icon: <Copy size={MENU_ICON} aria-hidden />,
    },
    { id: "sep2", label: "", separator: true },
    {
      id: "rename",
      label: t("shell.renameTitle"),
      icon: <PenLine size={MENU_ICON} aria-hidden />,
    },
    {
      id: "reveal",
      label: t("automations.menu.row.reveal"),
      icon: <FolderOpen size={MENU_ICON} aria-hidden />,
    },
  ];
}

export function buildBarContextItems(t: TFunction): ContextMenuItem[] {
  return [
    {
      id: "createMacro",
      label: t("shell.newMacro"),
      icon: <Workflow size={MENU_ICON} aria-hidden />,
    },
    {
      id: "createClicker",
      label: t("shell.newClickerPreset"),
      icon: <MousePointer2 size={MENU_ICON} aria-hidden />,
    },
    {
      id: "createScript",
      label: t("shell.newScript"),
      icon: <Code2 size={MENU_ICON} aria-hidden />,
    },
    { id: "sep1", label: "", separator: true },
    {
      id: "closeAll",
      label: t("shell.closeAllTabs"),
      icon: <ListX size={MENU_ICON} aria-hidden />,
    },
  ];
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

type OpenableKind = "macro" | "clicker" | "script";

type OpenableItem = {
  kind: OpenableKind;
  id: string;
  name: string;
  folderId: string | null;
};

function kindIcon(kind: OpenableKind) {
  if (kind === "macro") return <Workflow size={MENU_ICON} aria-hidden />;
  if (kind === "script") return <Code2 size={MENU_ICON} aria-hidden />;
  return <MousePointer2 size={MENU_ICON} aria-hidden />;
}

function openLeafItem(item: OpenableItem): ContextMenuItem {
  return {
    id: `open:${item.kind}:${item.id}`,
    label: item.name,
    icon: kindIcon(item.kind),
  };
}

function collectOpenable(
  kind: OpenableKind,
  index: LibraryIndexDto,
): OpenableItem[] {
  return index.items
    .filter((it) => !it.trashed)
    .map((it) => ({
      kind,
      id: it.id,
      name: it.name,
      folderId: it.folderId ?? null,
    }));
}

function matchesFilter(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q);
}

function buildOpenExistingSubmenu(
  indexes: LibraryIndexes | null,
  recent: RecentEntry[],
  filterQuery: string,
  onFilterChange: (value: string) => void,
  t: TFunction,
): ContextMenuItem[] {
  if (!indexes) {
    return [
      {
        id: "open-loading",
        label: t("shell.noMacros"),
        disabled: true,
      },
    ];
  }

  const items = [
    ...collectOpenable("macro", indexes.macros),
    ...collectOpenable("clicker", indexes.clickers),
    ...collectOpenable("script", indexes.scripts),
  ];

  const out: ContextMenuItem[] = [
    {
      id: "open-filter",
      label: t("shell.openFilterPlaceholder"),
      filter: {
        value: filterQuery,
        placeholder: t("shell.openFilterPlaceholder"),
        onChange: onFilterChange,
      },
    },
  ];

  if (items.length === 0) {
    out.push({
      id: "open-empty",
      label: t("shell.noMacros"),
      disabled: true,
    });
    return out;
  }

  const byKey = new Map(
    items.map((it) => [`${it.kind}:${it.id}`, it] as const),
  );

  const folderMap = new Map<string, string>();
  for (const f of [
    ...indexes.macros.folders,
    ...indexes.clickers.folders,
    ...indexes.scripts.folders,
  ]) {
    if (!folderMap.has(f.id)) folderMap.set(f.id, f.name);
  }
  const knownFolders = new Set(folderMap.keys());

  const recentLeaves = recent
    .filter((r) => r.kind === "macro" || r.kind === "clicker" || r.kind === "script")
    .map((r) => byKey.get(`${r.kind}:${r.id}`))
    .filter((it): it is OpenableItem => !!it)
    .filter((it) => matchesFilter(it.name, filterQuery))
    .slice(0, 5)
    .map(openLeafItem);

  if (recentLeaves.length > 0) {
    out.push({
      id: "open-recent-h",
      label: t("shell.openRecent"),
      groupHeader: true,
    });
    out.push(...recentLeaves);
  }

  const unfiled = items
    .filter(
      (it) =>
        it.folderId == null ||
        it.folderId === "" ||
        !knownFolders.has(it.folderId),
    )
    .filter((it) => matchesFilter(it.name, filterQuery))
    .slice()
    .sort(byName);

  if (unfiled.length > 0) {
    out.push({
      id: "open-unfiled-h",
      label: t("shell.openUnfiled"),
      groupHeader: true,
    });
    out.push(...unfiled.map(openLeafItem));
  }

  const folders = [...folderMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort(byName);

  for (const folder of folders) {
    const children = items
      .filter((it) => it.folderId === folder.id)
      .filter((it) => matchesFilter(it.name, filterQuery))
      .slice()
      .sort(byName);
    if (children.length === 0) continue;
    out.push({
      id: `open-folder:${folder.id}`,
      label: folder.name,
      icon: <FolderOpen size={MENU_ICON} aria-hidden />,
      submenu: children.map(openLeafItem),
    });
  }

  const hasLeaves = out.some(
    (it) => !it.groupHeader && !it.filter && !it.disabled && !it.separator,
  );
  if (!hasLeaves) {
    out.push({
      id: "open-empty-filter",
      label: t("shell.noMacros"),
      disabled: true,
    });
  }

  return out;
}

type LibraryIndexes = {
  macros: LibraryIndexDto;
  clickers: LibraryIndexDto;
  scripts: LibraryIndexDto;
};

function buildCreateMenuItems(
  t: TFunction,
  indexes: LibraryIndexes | null,
  recent: RecentEntry[],
  filterQuery: string,
  onFilterChange: (value: string) => void,
): ContextMenuItem[] {
  return [
    {
      id: "macro",
      label: t("shell.blankMacro"),
      icon: <Workflow size={MENU_ICON} aria-hidden />,
    },
    {
      id: "clicker",
      label: t("shell.clickerPreset"),
      icon: <MousePointer2 size={MENU_ICON} aria-hidden />,
    },
    {
      id: "script",
      label: t("labels.script"),
      icon: <Code2 size={MENU_ICON} aria-hidden />,
    },
    {
      id: "openExistingMacro",
      label: t("shell.openExistingMacro"),
      icon: <FolderOpen size={MENU_ICON} aria-hidden />,
      submenu: buildOpenExistingSubmenu(
        indexes,
        recent,
        filterQuery,
        onFilterChange,
        t,
      ),
    },
  ];
}

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
  onOpenExisting,
  onTabContextAction,
  onBarContextAction,
  onTabReorder,
  onPinnedCloseAttempt,
}: Props) {
  const t = useT();
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabElsRef = useRef(new Map<string, HTMLDivElement>());

  const [libraryIndexes, setLibraryIndexes] = useState<LibraryIndexes | null>(
    null,
  );
  const [openRecent, setOpenRecent] = useState<RecentEntry[]>([]);
  const [openFilterQuery, setOpenFilterQuery] = useState("");
  const createMenuItems = useMemo(
    () =>
      buildCreateMenuItems(
        t,
        libraryIndexes,
        openRecent,
        openFilterQuery,
        setOpenFilterQuery,
      ),
    [t, libraryIndexes, openRecent, openFilterQuery],
  );
  const homeContextItems = useMemo(() => buildHomeContextItems(t), [t]);
  const barContextItems = useMemo(() => buildBarContextItems(t), [t]);

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
    () => displayTabs.filter((tab) => tab.kind !== "home").map((tab) => tab.id),
    [displayTabs],
  );

  const scrollActiveTabIntoView = useCallback(() => {
    if (activeTabId === HOME_TAB_ID) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const active = scroll.querySelector(".caster-doc-tab.active");
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
    setLibraryIndexes(null);
    setOpenRecent([]);
    setOpenFilterQuery("");
    const empty: LibraryIndexDto = { folders: [], items: [], trash: [] };
    void Promise.all([
      invoke<LibraryIndexDto>("get_library_index_cmd", { kind: "macro" }),
      invoke<LibraryIndexDto>("get_library_index_cmd", { kind: "clicker" }),
      invoke<LibraryIndexDto>("get_library_index_cmd", { kind: "script" }),
      invoke<QuickAccess>("get_quick_access").catch(() => ({
        favorites: { clickerPresets: [], macros: [], scripts: [] },
        recent: [] as RecentEntry[],
      })),
    ])
      .then(([macros, clickers, scripts, qa]) => {
        setLibraryIndexes({ macros, clickers, scripts });
        setOpenRecent(qa.recent ?? []);
      })
      .catch(() => {
        setLibraryIndexes({
          macros: empty,
          clickers: empty,
          scripts: empty,
        });
        setOpenRecent([]);
      });
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
        items: homeContextItems,
      });
      return;
    }
    setMenu({
      kind: "tab",
      tabId: tab.id,
      x: e.clientX,
      y: e.clientY,
      items: buildDocTabContextItems(tab, t),
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
    const openMatch = /^open:(macro|clicker|script):(.+)$/.exec(id);
    if (openMatch) {
      const kind = openMatch[1] as OpenableKind;
      const resourceId = openMatch[2];
      if (!resourceId) return;
      const pool = libraryIndexes
        ? [
            ...collectOpenable("macro", libraryIndexes.macros),
            ...collectOpenable("clicker", libraryIndexes.clickers),
            ...collectOpenable("script", libraryIndexes.scripts),
          ]
        : [];
      const hit = pool.find((it) => it.kind === kind && it.id === resourceId);
      onOpenExisting?.(kind, resourceId, hit?.name ?? resourceId);
    }
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

  const homeTab = displayTabs.find((tab) => tab.kind === "home");
  const scrollTabs = displayTabs.filter((tab) => tab.kind !== "home");

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

    const tooltipText = tabTooltipText(tab, t);
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
          "caster-doc-tab-main",
          draggable ? "caster-doc-tab-main--draggable" : "",
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
          "caster-doc-tab",
          tab.kind === "home" ? "caster-doc-tab--home" : "",
          tab.kind === "macro" ? "caster-doc-tab--macro" : "",
          tab.kind === "clicker" ? "caster-doc-tab--clicker" : "",
          tab.kind === "script" ? "caster-doc-tab--script" : "",
          tab.pinned ? "caster-doc-tab--pinned" : "",
          compact ? "caster-doc-tab--compact" : "",
          isDragSource ? "caster-doc-tab--drag-source" : "",
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
            className="caster-doc-tab-close"
            aria-label={t("shell.closeTabAria", { label: tab.label })}
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
      <div className="caster-doc-tabbar" onContextMenu={openBarMenu}>
        {homeTab ? (
          <div className="caster-doc-tabbar-home">{renderDocTab(homeTab)}</div>
        ) : null}
        <div
          ref={scrollRef}
          className={[
            "caster-doc-tabbar-scroll",
            dragUi.isDragging ? "is-tab-dragging" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onContextMenu={openBarMenu}
        >
          <div
            className="caster-doc-tabbar-strip"
            role="tablist"
            aria-label={t("shell.tabsListAria")}
          >
            {scrollTabs.map((tab) => renderDocTab(tab))}
            <div className="caster-doc-tabbar-add">
              <button
                ref={addBtnRef}
                type="button"
                className="caster-doc-tab-add-btn"
                aria-label={t("shell.createAutomation")}
                aria-expanded={createMenu != null}
                aria-haspopup="menu"
                onClick={toggleCreateMenu}
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
            <div
              className="caster-doc-tabbar-drag-fill"
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
                "caster-doc-tab",
                "caster-doc-tab-ghost",
                ghost.tab.kind === "macro" ? "caster-doc-tab--macro" : "",
                ghost.tab.kind === "clicker" ? "caster-doc-tab--clicker" : "",
                ghost.tab.kind === "script" ? "caster-doc-tab--script" : "",
                ghost.tab.pinned ? "caster-doc-tab--pinned" : "",
                ghostCompact ? "caster-doc-tab--compact" : "",
                ghostActive ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ display: "none" }}
            >
              <span className="caster-doc-tab-main caster-doc-tab-main--ghost">
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
        items={createMenuItems}
        onClose={() => setCreateMenu(null)}
        onSelect={onCreateMenuSelect}
        ariaLabel={t("shell.createAutomation")}
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
            ? t("shell.tabActionsAria")
            : menu?.kind === "home"
              ? t("shell.homeActionsAria")
              : t("shell.tabBarActionsAria")
        }
      />
    </>
  );
}

import { useMemo, useState, type MouseEvent } from "react";
import { ScrollText, Settings } from "lucide-react";
import { useT } from "../../i18n";
import { WindowControls } from "../WindowControls";
import {
  buildBarContextItems,
  DocumentTabBar,
  type BarContextAction,
  type DocumentTabItem,
  type TabContextAction,
} from "./DocumentTabBar";
import { ContextMenu } from "./ContextMenu";

type Props = {
  tabs: DocumentTabItem[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose?: (id: string) => void;
  onCreateMacro?: () => void;
  onCreateClicker?: () => void;
  onCreateScript?: () => void;
  onOpenExisting?: (
    kind: "macro" | "clicker" | "script",
    id: string,
    label?: string,
  ) => void;
  /** Prefetch lazy editor chunk (hover). */
  onPrefetchEditor?: (kind: "macro" | "clicker" | "script" | "settings") => void;
  onTabContextAction?: (tabId: string, action: TabContextAction) => void;
  onBarContextAction?: (action: BarContextAction) => void;
  onTabReorder?: (fromTabId: string, insertBeforeTabId: string | null) => void;
  onPinnedCloseAttempt?: () => void;
  settingsActive?: boolean;
  onSettingsClick?: () => void;
  onJournalClick?: () => void;
  journalOpen?: boolean;
};

export function WindowTitleBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onCreateMacro,
  onCreateClicker,
  onCreateScript,
  onOpenExisting,
  onPrefetchEditor,
  onTabContextAction,
  onBarContextAction,
  onTabReorder,
  onPinnedCloseAttempt,
  settingsActive = false,
  onSettingsClick,
  onJournalClick,
  journalOpen,
}: Props) {
  const t = useT();
  const [dragMenu, setDragMenu] = useState<{ x: number; y: number } | null>(null);
  const barItems = useMemo(() => buildBarContextItems(t), [t]);

  const openDragMenu = (e: MouseEvent) => {
    if (!onBarContextAction) return;
    e.preventDefault();
    setDragMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="caster-titlebar">
      <div className="caster-titlebar-start">
        <DocumentTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={onTabSelect}
          onClose={onTabClose}
          onCreateMacro={onCreateMacro}
          onCreateClicker={onCreateClicker}
          onCreateScript={onCreateScript}
          onOpenExisting={onOpenExisting}
          onPrefetchEditor={onPrefetchEditor}
          onTabContextAction={onTabContextAction}
          onBarContextAction={onBarContextAction}
          onTabReorder={onTabReorder}
          onPinnedCloseAttempt={onPinnedCloseAttempt}
        />
      </div>
      <div
        className="caster-titlebar-drag"
        data-tauri-drag-region
        onContextMenu={openDragMenu}
      />
      <div className="caster-titlebar-actions">
        {onSettingsClick ? (
          <button
            type="button"
            className={[
              "caster-titlebar-btn caster-titlebar-icon-btn",
              settingsActive ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={onSettingsClick}
            onMouseEnter={() => onPrefetchEditor?.("settings")}
            title={t("shell.navSettings")}
            aria-label={t("shell.navSettings")}
            aria-pressed={settingsActive}
          >
            <Settings size={14} aria-hidden />
          </button>
        ) : null}
        {onJournalClick ? (
          <button
            type="button"
            className={[
              "caster-titlebar-btn caster-titlebar-icon-btn",
              journalOpen ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={onJournalClick}
            title={t("shell.journalTitle")}
            aria-label={t("shell.journalTitle")}
            aria-pressed={journalOpen}
          >
            <ScrollText size={14} aria-hidden />
          </button>
        ) : null}
        <WindowControls className="caster-titlebar-controls" />
      </div>
      <ContextMenu
        open={dragMenu != null}
        x={dragMenu?.x ?? 0}
        y={dragMenu?.y ?? 0}
        items={barItems}
        onClose={() => setDragMenu(null)}
        onSelect={(id) => {
          if (
            onBarContextAction &&
            (id === "createMacro" ||
              id === "createClicker" ||
              id === "createScript" ||
              id === "closeAll")
          ) {
            onBarContextAction(id);
          }
        }}
        ariaLabel={t("shell.tabBarActionsAria")}
      />
    </div>
  );
}

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
import { RecentMenu, type RecentMenuItem } from "./RecentMenu";
import { StatusPill, type StatusKind } from "./StatusPill";

type Props = {
  tabs: DocumentTabItem[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose?: (id: string) => void;
  onCreateMacro?: () => void;
  onCreateClicker?: () => void;
  onCreateScript?: () => void;
  onTabContextAction?: (tabId: string, action: TabContextAction) => void;
  onBarContextAction?: (action: BarContextAction) => void;
  onTabReorder?: (fromTabId: string, insertBeforeTabId: string | null) => void;
  onPinnedCloseAttempt?: () => void;
  settingsActive?: boolean;
  onSettingsClick?: () => void;
  onJournalClick?: () => void;
  journalOpen?: boolean;
  sessionStatus?: { kind: StatusKind; label: string } | null;
  showStop?: boolean;
  onStop?: () => void;
  recentItems?: RecentMenuItem[];
};

export function WindowTitleBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onCreateMacro,
  onCreateClicker,
  onCreateScript,
  onTabContextAction,
  onBarContextAction,
  onTabReorder,
  onPinnedCloseAttempt,
  settingsActive = false,
  onSettingsClick,
  onJournalClick,
  journalOpen,
  sessionStatus,
  showStop,
  onStop,
  recentItems,
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
    <div className="v2-titlebar">
      <div className="v2-titlebar-start">
        <DocumentTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={onTabSelect}
          onClose={onTabClose}
          onCreateMacro={onCreateMacro}
          onCreateClicker={onCreateClicker}
          onCreateScript={onCreateScript}
          onTabContextAction={onTabContextAction}
          onBarContextAction={onBarContextAction}
          onTabReorder={onTabReorder}
          onPinnedCloseAttempt={onPinnedCloseAttempt}
        />
      </div>
      <div
        className="v2-titlebar-drag"
        data-tauri-drag-region
        onContextMenu={openDragMenu}
      />
      <div className="v2-titlebar-actions">
        {recentItems ? <RecentMenu items={recentItems} /> : null}
        {onSettingsClick ? (
          <button
            type="button"
            className={[
              "v2-titlebar-btn v2-titlebar-icon-btn",
              settingsActive ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={onSettingsClick}
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
              "v2-titlebar-btn v2-titlebar-icon-btn",
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
        {sessionStatus || (showStop && onStop) ? (
          <div className="v2-titlebar-session-slot">
            <div className="v2-titlebar-session-pill">
              {sessionStatus ? (
                <StatusPill kind={sessionStatus.kind} label={sessionStatus.label} />
              ) : null}
            </div>
            <div className="v2-titlebar-session-stop">
              {showStop && onStop ? (
                <button
                  type="button"
                  className="v2-titlebar-btn v2-btn v2-btn-danger-ghost"
                  onClick={onStop}
                  title={t("shell.stopSession")}
                >
                  {t("shell.stop")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <WindowControls className="v2-titlebar-controls" />
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

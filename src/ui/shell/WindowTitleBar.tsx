import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { ScrollText, Settings } from "lucide-react";
import { useT } from "../../i18n";
import { WindowControls } from "../WindowControls";
import {
  buildBarContextItems,
  type BarContextAction,
} from "./DocumentTabBar";
import { ContextMenu } from "./ContextMenu";
import { useTitleBarDispatch } from "./TitleBarContext";

type Props = {
  /** Prefetch lazy editor chunk (hover). */
  onPrefetchEditor?: (kind: "macro" | "clicker" | "script" | "settings") => void;
  onBarContextAction?: (action: BarContextAction) => void;
  settingsActive?: boolean;
  onSettingsClick?: () => void;
  onJournalClick?: () => void;
  journalOpen?: boolean;
};

export function WindowTitleBar({
  onPrefetchEditor,
  onBarContextAction,
  settingsActive = false,
  onSettingsClick,
  onJournalClick,
  journalOpen,
}: Props) {
  const t = useT();
  const dispatch = useTitleBarDispatch();
  const [dragMenu, setDragMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const barItems = useMemo(() => buildBarContextItems(t), [t]);

  const chromeHostRef = useCallback(
    (el: HTMLDivElement | null) => {
      dispatch?.setChromeHost(el);
    },
    [dispatch],
  );

  const openDragMenu = (e: MouseEvent) => {
    if (!onBarContextAction) return;
    e.preventDefault();
    setDragMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="caster-titlebar">
      <div
        className="caster-titlebar-start caster-titlebar-chrome-host"
        ref={chromeHostRef}
      />
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

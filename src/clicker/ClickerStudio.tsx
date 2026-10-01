import { useCallback, useState, type KeyboardEvent } from "react";
import { useTitleBarSlot } from "../ui/shell/TitleBarContext";
import type { EngineStatus, HotkeyBindings } from "../macros/types";
import type { ThemeMode } from "../theme";
import { useT } from "../i18n";
import { ClickerMetaBar } from "./ClickerMetaBar";
import { ClickerTitleBarTools } from "./ClickerTitleBarTools";
import { ClickerZonePreview } from "./ClickerZonePreview";
import { ClickerTargetPreview } from "./ClickerTargetPreview";
import { ClickerEntrySection } from "./sections/ClickerEntrySection";
import { ClickerLimitsSection } from "./sections/ClickerLimitsSection";
import { ClickerTargetSection } from "./sections/ClickerTargetSection";
import { ClickerZonesSection } from "./sections/ClickerZonesSection";
import { useClickerEditor } from "./useClickerEditor";

type Props = {
  presetId: string;
  onBack: () => void;
  status: EngineStatus;
  onStatus: (s: EngineStatus) => void;
  refresh: () => Promise<void>;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  onDirtyChange?: (id: string, dirty: boolean) => void;
  onRenamed?: (from: string, to: string) => void;
  hotkeys: HotkeyBindings;
  onOpenProcessSettings?: () => void;
  onSavedAsNew?: (id: string) => void;
  active?: boolean;
};

type InspectorTab = "entry" | "target" | "zones" | "limits";

const TAB_IDS: InspectorTab[] = ["entry", "target", "zones", "limits"];

export function ClickerStudio({
  presetId,
  onBack,
  status,
  onStatus,
  refresh,
  theme,
  onDirtyChange,
  onRenamed,
  hotkeys,
  onOpenProcessSettings,
  onSavedAsNew,
  active = true,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<InspectorTab>("entry");

  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "entry", label: t("clicker.tabs.entry") },
    { id: "target", label: t("clicker.tabs.target") },
    { id: "zones", label: t("clicker.tabs.zones") },
    { id: "limits", label: t("clicker.tabs.limits") },
  ];

  const handleDirtyChange = useCallback(
    (dirty: boolean) => onDirtyChange?.(presetId, dirty),
    [onDirtyChange, presetId],
  );

  const editor = useClickerEditor({
    presetId,
    status,
    onStatus,
    refresh,
    theme,
    onDirtyChange: handleDirtyChange,
    onRenamed,
  });

  const titleBarPortal = useTitleBarSlot(
    editor.presetName || presetId,
    <ClickerTitleBarTools
      editor={editor}
      onBack={onBack}
      hotkeys={hotkeys}
      onSavedAsNew={onSavedAsNew}
      onOpenProcessSettings={onOpenProcessSettings}
      meta={<ClickerMetaBar editor={editor} />}
    />,
    { active },
  );

  const onTabKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    const i = TAB_IDS.indexOf(tab);
    if (i < 0) return;
    let next = i;
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
      next = (i + 1) % TAB_IDS.length;
    } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
      next = (i - 1 + TAB_IDS.length) % TAB_IDS.length;
    } else if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = TAB_IDS.length - 1;
    } else {
      return;
    }
    ev.preventDefault();
    setTab(TAB_IDS[next]!);
    const el = document.getElementById(`clicker-tab-${TAB_IDS[next]}`);
    el?.focus();
  };

  const paneClass = [
    "caster-clicker-inspector-pane",
    tab === "entry" ? "caster-clicker-inspector-pane--entry" : "",
    tab === "target" || tab === "zones"
      ? "caster-clicker-inspector-pane--zones"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="caster-page caster-clicker-studio">
      {titleBarPortal}
      <div className="caster-clicker-center">
        <div className="caster-settings-pane-inner caster-clicker-settings">
          <div
            className="caster-segmented caster-segmented--wide caster-clicker-nav"
            role="tablist"
            aria-label={t("clicker.tabs.navAria")}
            onKeyDown={onTabKeyDown}
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                id={`clicker-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`clicker-panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                className={[
                  "caster-segmented-btn",
                  tab === item.id ? "active" : "",
                ].join(" ")}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className={paneClass}>
            <div
              id="clicker-panel-entry"
              className="caster-clicker-tab-panel"
              role="tabpanel"
              aria-labelledby="clicker-tab-entry"
              hidden={tab !== "entry"}
              inert={tab !== "entry" ? true : undefined}
            >
              <ClickerEntrySection editor={editor} />
            </div>
            <div
              id="clicker-panel-target"
              className="caster-clicker-tab-panel"
              role="tabpanel"
              aria-labelledby="clicker-tab-target"
              hidden={tab !== "target"}
              inert={tab !== "target" ? true : undefined}
            >
              <div className="caster-clicker-zones-split">
                <ClickerTargetSection editor={editor} />
                <ClickerTargetPreview editor={editor} />
              </div>
            </div>
            <div
              id="clicker-panel-zones"
              className="caster-clicker-tab-panel"
              role="tabpanel"
              aria-labelledby="clicker-tab-zones"
              hidden={tab !== "zones"}
              inert={tab !== "zones" ? true : undefined}
            >
              <div className="caster-clicker-zones-split">
                <ClickerZonesSection editor={editor} />
                <ClickerZonePreview editor={editor} />
              </div>
            </div>
            <div
              id="clicker-panel-limits"
              className="caster-clicker-tab-panel"
              role="tabpanel"
              aria-labelledby="clicker-tab-limits"
              hidden={tab !== "limits"}
              inert={tab !== "limits" ? true : undefined}
            >
              <ClickerLimitsSection editor={editor} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

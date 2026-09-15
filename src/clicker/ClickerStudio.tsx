import { useCallback, useState } from "react";
import { useTitleBarSlot } from "../ui/shell/TitleBarContext";
import type { EngineStatus, HotkeyBindings } from "../macros/types";
import type { ThemeMode } from "../theme";
import { useT } from "../i18n";
import { ClickerSessionStats } from "./ClickerSessionStats";
import { ClickerTitleBarTools } from "./ClickerTitleBarTools";
import { ClickerZonePreview } from "./ClickerZonePreview";
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
};

type InspectorTab = "entry" | "target" | "zones" | "limits";

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
    <ClickerTitleBarTools editor={editor} onBack={onBack} hotkeys={hotkeys} />,
  );

  return (
    <div className="caster-page caster-clicker-studio">
      {titleBarPortal}
      <ClickerSessionStats
        samples={editor.cpsSamples}
        metrics={editor.metrics}
        running={editor.running}
        paused={editor.sessionPaused}
      />
      <div className="caster-clicker-center">
        <div className="caster-settings-pane-inner caster-clicker-settings">
          <div className="caster-tabs caster-clicker-tabs" role="tablist">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={["caster-tab", tab === item.id ? "active" : ""].join(" ")}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="caster-clicker-inspector-pane" role="tabpanel">
            {tab === "entry" ? (
              <ClickerEntrySection
                editor={editor}
                onOpenProcessSettings={onOpenProcessSettings}
              />
            ) : null}
            {tab === "target" ? <ClickerTargetSection editor={editor} /> : null}
            {tab === "zones" ? (
              <div className="caster-clicker-zones-split">
                <ClickerZonesSection editor={editor} />
                <ClickerZonePreview editor={editor} />
              </div>
            ) : null}
            {tab === "limits" ? <ClickerLimitsSection editor={editor} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

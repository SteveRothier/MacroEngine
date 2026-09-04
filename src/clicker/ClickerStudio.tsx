import { useCallback, useState } from "react";
import { useTitleBarSlot } from "../ui/v2/TitleBarContext";
import type { EngineStatus, HotkeyBindings } from "../macros/types";
import type { ThemeMode } from "../theme";
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
  hotkeys: HotkeyBindings;
  onOpenProcessSettings?: () => void;
};

type InspectorTab = "entry" | "target" | "zones" | "limits";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "entry", label: "Entrée" },
  { id: "target", label: "Cible" },
  { id: "zones", label: "Zones" },
  { id: "limits", label: "Limites" },
];

export function ClickerStudio({
  presetId,
  onBack,
  status,
  onStatus,
  refresh,
  theme,
  onDirtyChange,
  hotkeys,
  onOpenProcessSettings,
}: Props) {
  const [tab, setTab] = useState<InspectorTab>("entry");

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
  });

  const titleBarPortal = useTitleBarSlot(
    editor.presetName || presetId,
    <ClickerTitleBarTools editor={editor} onBack={onBack} hotkeys={hotkeys} />,
  );

  return (
    <div className="v2-page v2-clicker-studio">
      {titleBarPortal}
      <ClickerSessionStats
        samples={editor.cpsSamples}
        metrics={editor.metrics}
        running={editor.running}
        paused={editor.sessionPaused}
      />
      <div className="v2-clicker-center">
        <div className="v2-settings-pane-inner v2-clicker-settings">
          <div className="v2-tabs v2-clicker-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={["v2-tab", tab === t.id ? "active" : ""].join(" ")}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="v2-clicker-inspector-pane" role="tabpanel">
            {tab === "entry" ? (
              <ClickerEntrySection
                editor={editor}
                onOpenProcessSettings={onOpenProcessSettings}
              />
            ) : null}
            {tab === "target" ? <ClickerTargetSection editor={editor} /> : null}
            {tab === "zones" ? (
              <div className="v2-clicker-zones-split">
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

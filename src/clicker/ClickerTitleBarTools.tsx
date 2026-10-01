import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  ClipboardCopy,
  Download,
  FilePlus2,
  LayoutTemplate,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  Redo2,
  Save,
  Undo2,
  Upload,
} from "lucide-react";
import { DisplayPopover, DropdownMenu, EditorToolbar, useToast } from "../ui/shell";
import type { DropdownEntry } from "../ui/shell";
import { promptAction } from "../ui";
import {
  chordLabel,
  triggerHotkeyLabel,
  vkLabel,
  type HotkeyBindings,
} from "../macros/types";
import { useT } from "../i18n";
import {
  CLICKER_TEMPLATES,
  clickerTemplateLabel,
} from "./clickerTemplates";
import {
  buildSessionStatsSnapshot,
  sessionStatsToCsv,
  sessionStatsToJson,
} from "./sessionStatsExport";
import type { ClickerEditor } from "./useClickerEditor";
import type { DisplayDto } from "./clickerTypes";
import { ProcessFilterTool } from "../process";

type Props = {
  editor: ClickerEditor;
  onBack: () => void;
  hotkeys: HotkeyBindings;
  /** Called with the new preset id after « Sauver comme nouveau preset ». */
  onSavedAsNew?: (id: string) => void;
  /** Nom / raccourci — fused into this bar (same as macros). */
  meta?: ReactNode;
  onOpenProcessSettings?: () => void;
};

function displayOptionLabel(d: DisplayDto, primarySuffix: string): string {
  const base = d.label?.trim() || `${d.width}×${d.height}`;
  return d.isPrimary ? `${base}${primarySuffix}` : base;
}

export function ClickerTitleBarTools({
  editor,
  onBack,
  hotkeys,
  onSavedAsNew,
  meta,
  onOpenProcessSettings,
}: Props) {
  const t = useT();
  const toast = useToast();
  const [displayOpen, setDisplayOpen] = useState(false);
  const displayBtnRef = useRef<HTMLButtonElement>(null);
  const displayTitleId = useId();

  const activeDisplay =
    editor.displays.find((d) => d.id === editor.activeDisplayId) ??
    editor.displays.find((d) => d.isPrimary) ??
    editor.displays[0] ??
    null;
  const displayMissing =
    editor.activeDisplayId != null &&
    editor.displays.length > 0 &&
    !editor.displays.some((d) => d.id === editor.activeDisplayId);
  const displayDisabled = editor.editDisabled || editor.running;

  const saveAsNew = async () => {
    const raw = await promptAction({
      title: t("clicker.prompts.saveAsNewTitle"),
      message: t("clicker.prompts.saveAsNewMessage"),
      defaultValue: `${editor.presetName || editor.selectedPreset} copie`.trim(),
      confirmLabel: t("common.save"),
      placeholder: t("clicker.prompts.saveAsNewPlaceholder"),
    });
    const name = raw?.trim();
    if (!name) return;
    try {
      const id = await editor.onSaveAsNewPreset(name);
      toast.success(t("clicker.toasts.presetCreated", { name: id }));
      onSavedAsNew?.(id);
    } catch (e: unknown) {
      const msg =
        typeof e === "string"
          ? e
          : e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message)
            : t("clicker.toasts.saveAsNewFailed");
      toast.error(msg);
    }
  };
  const modeLabel =
    editor.mode === "toggle"
      ? t("clicker.toolbar.toggle")
      : t("clicker.toolbar.hold");
  const presetTriggerHint =
    editor.trigger.type === "hotkey"
      ? t("clicker.toolbar.triggerHint", {
          label: triggerHotkeyLabel(editor.trigger),
        })
      : null;
  const hotkeyHint =
    presetTriggerHint ??
    t("clicker.toolbar.hotkeyHint", {
      chord: chordLabel(hotkeys),
      mode: modeLabel,
    });
  const sessionPaused = editor.sessionPaused;
  const pauseHint = hotkeys.pauseVk
    ? ` (${vkLabel(hotkeys.pauseVk)})`
    : "";

  const formatLimitClock = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };

  const showClicksLimit =
    editor.running &&
    editor.limitsEnabled &&
    (editor.limitMode === "clicks" || editor.limitMode === "both") &&
    editor.maxClicks !== "" &&
    Number(editor.maxClicks) > 0;
  const showTimeLimit =
    editor.running &&
    editor.limitsEnabled &&
    (editor.limitMode === "time" || editor.limitMode === "both") &&
    editor.maxDurationSec !== "" &&
    Number(editor.maxDurationSec) > 0;

  const canExportStats =
    editor.running ||
    editor.cpsSamples.length > 0 ||
    (editor.metrics?.clicksEmitted ?? 0) > 0;

  const sessionLimits = editor.limitsEnabled
    ? {
        enabled: true as const,
        mode: editor.limitMode,
        maxClicks:
          editor.maxClicks !== "" && Number(editor.maxClicks) > 0
            ? Number(editor.maxClicks)
            : null,
        maxDurationSec:
          editor.maxDurationSec !== "" && Number(editor.maxDurationSec) > 0
            ? Number(editor.maxDurationSec)
            : null,
      }
    : null;

  const buildStatsSnapshot = () =>
    buildSessionStatsSnapshot({
      metrics: editor.metrics,
      samples: editor.cpsSamples,
      running: editor.running,
      paused: sessionPaused,
      limits: sessionLimits,
    });

  const onCopyStats = async () => {
    try {
      await navigator.clipboard.writeText(
        sessionStatsToJson(buildStatsSnapshot()),
      );
      toast.success(t("clicker.session.statsCopied"));
    } catch {
      toast.error(t("clicker.session.statsCopyFailed"));
    }
  };

  const onSaveStats = async (format: "json" | "csv") => {
    try {
      const snap = buildStatsSnapshot();
      const body =
        format === "json" ? sessionStatsToJson(snap) : sessionStatsToCsv(snap);
      const filePath = await save({
        defaultPath:
          format === "json"
            ? "clicker-session-stats.json"
            : "clicker-session-stats.csv",
        filters: [
          format === "json"
            ? { name: "JSON", extensions: ["json"] }
            : { name: "CSV", extensions: ["csv"] },
        ],
      });
      if (!filePath) return;
      await invoke("write_text_file", { path: filePath, contents: body });
      toast.success(t("clicker.session.statsExported"));
    } catch {
      toast.error(t("clicker.session.statsExportFailed"));
    }
  };

  const templateItems = CLICKER_TEMPLATES.map((tpl) => {
    const label = clickerTemplateLabel(t, tpl.id);
    return {
      id: `tpl-${tpl.id}`,
      label,
      icon: <LayoutTemplate size={14} />,
      onSelect: () => {
        editor.applyTemplate(tpl.build());
        toast.success(t("clicker.toasts.templateApplied", { label }));
      },
    };
  });

  const moreItems: DropdownEntry[] = [
    {
      id: "save-now",
      label: t("clicker.toolbar.saveNow"),
      icon: <Save size={14} />,
      onSelect: () => {
        void editor.onSavePreset().then(
          () => toast.success(t("clicker.toasts.presetSaved")),
          (e: unknown) => {
            const msg =
              typeof e === "string"
                ? e
                : e && typeof e === "object" && "message" in e
                  ? String((e as { message?: unknown }).message)
                  : t("clicker.toasts.saveFailed");
            toast.error(msg);
          },
        );
      },
    },
    {
      id: "save-as-new",
      label: t("clicker.toolbar.saveAsNew"),
      icon: <FilePlus2 size={14} />,
      onSelect: () => void saveAsNew(),
    },
    {
      id: "templates",
      label: t("clicker.toolbar.templates"),
      icon: <LayoutTemplate size={14} />,
      submenu: templateItems,
    },
    { id: "sep-io", label: "", separator: true },
    {
      id: "import",
      label: t("clicker.toolbar.import"),
      icon: <Upload size={14} />,
      onSelect: () => {
        void editor.onImportPreset().then((id) => {
          if (id) onSavedAsNew?.(id);
        });
      },
    },
    {
      id: "export",
      label: t("clicker.toolbar.export"),
      icon: <Download size={14} />,
      onSelect: () => void editor.onExportPreset(),
    },
    { id: "sep-stats", label: "", separator: true },
    {
      id: "copy-stats",
      label: t("clicker.toolbar.copyStats"),
      icon: <ClipboardCopy size={14} />,
      disabled: !canExportStats,
      onSelect: () => void onCopyStats(),
    },
    {
      id: "export-stats",
      label: t("clicker.toolbar.exportStats"),
      icon: <Download size={14} />,
      disabled: !canExportStats,
      submenu: [
        {
          id: "export-stats-json",
          label: t("clicker.session.exportJson"),
          disabled: !canExportStats,
          onSelect: () => void onSaveStats("json"),
        },
        {
          id: "export-stats-csv",
          label: t("clicker.session.exportCsv"),
          disabled: !canExportStats,
          onSelect: () => void onSaveStats("csv"),
        },
      ],
    },
  ];

  return (
    <EditorToolbar
      start={
        <>
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-ghost"
            onClick={onBack}
            title={t("clicker.toolbar.back")}
          >
            <ArrowLeft size={14} aria-hidden />
          </button>
          {meta}
          {editor.locked ? (
            <span
              className="caster-clicker-lock"
              title={t("clicker.toolbar.lockedTitle")}
            >
              {t("clicker.toolbar.locked")}
            </span>
          ) : null}
        </>
      }
      end={
        <>
          <div className="caster-toolbar-menu">
            <button
              ref={displayBtnRef}
              type="button"
              className={[
                "caster-titlebar-btn",
                "caster-btn",
                "caster-btn-ghost",
                displayOpen ? "is-active" : "",
                displayMissing ? "is-warn" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={displayDisabled || editor.displays.length === 0}
              title={
                displayMissing
                  ? t("clicker.zones.displayMissing")
                  : activeDisplay
                    ? displayOptionLabel(
                        activeDisplay,
                        t("clicker.zones.primarySuffix"),
                      )
                    : t("clicker.zones.displayAria")
              }
              aria-label={
                displayMissing
                  ? t("clicker.zones.displayMissing")
                  : t("clicker.zones.displayAria")
              }
              aria-expanded={displayOpen}
              aria-haspopup="dialog"
              onClick={() => setDisplayOpen((v) => !v)}
            >
              <Monitor size={14} aria-hidden />
            </button>
            <DisplayPopover
              open={displayOpen}
              onClose={() => setDisplayOpen(false)}
              anchorRef={displayBtnRef}
              labelledBy={displayTitleId}
            >
              <div className="caster-display-popover-panel">
                <p id={displayTitleId} className="caster-display-popover-title">
                  {t("clicker.zones.displayAria")}
                </p>
                {displayMissing ? (
                  <p className="caster-display-popover-warn">
                    {t("clicker.zones.displayMissing")}
                  </p>
                ) : null}
                <ul className="caster-display-popover-list" role="listbox">
                  {editor.displays.map((d) => {
                    const selected = d.id === editor.activeDisplayId;
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={[
                            "caster-display-popover-option",
                            selected ? "is-selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            void editor.onSelectDisplay(d.id);
                            setDisplayOpen(false);
                          }}
                        >
                          {displayOptionLabel(
                            d,
                            t("clicker.zones.primarySuffix"),
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </DisplayPopover>
          </div>
          <ProcessFilterTool
            filter={editor.processFilter}
            mode={editor.presetFilterMode}
            onModeChange={editor.setPresetFilterMode}
            localFilter={editor.localProcessFilter}
            onLocalFilterChange={editor.setLocalProcessFilter}
            disabled={editor.editDisabled || editor.running}
            onOpenSettings={onOpenProcessSettings}
            onGlobalFilterChange={editor.setGlobalProcessFilter}
            presets={editor.processFilterPresets}
            onPresetsChange={editor.setProcessFilterPresets}
          />
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-ghost"
            disabled={!editor.canUndo || editor.editDisabled}
            title={t("clicker.toolbar.undoTitle")}
            aria-label={t("clicker.toolbar.undo")}
            onClick={() => editor.undoConfig()}
          >
            <Undo2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-ghost"
            disabled={!editor.canRedo || editor.editDisabled}
            title={t("clicker.toolbar.redoTitle")}
            aria-label={t("clicker.toolbar.redo")}
            onClick={() => editor.redoConfig()}
          >
            <Redo2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-primary"
            disabled={editor.running}
            title={hotkeyHint}
            onClick={() => void editor.onStart()}
          >
            {t("clicker.toolbar.start")}
          </button>
          {editor.running ? (
            <span className="caster-clicker-runtime" aria-live="polite">
              <span>
                {t("clicker.toolbar.runtimeCps", {
                  cps:
                    editor.metrics != null
                      ? editor.metrics.measuredCps.toFixed(1)
                      : editor.cadenceDisplay,
                })}
              </span>
              <span>
                {t("clicker.toolbar.runtimeClicks", {
                  n: editor.metrics?.clicksEmitted ?? 0,
                })}
              </span>
              {showClicksLimit ? (
                <span className="caster-clicker-runtime-limit">
                  {t("clicker.limits.progressClicks", {
                    done: editor.metrics?.clicksEmitted ?? 0,
                    max: Number(editor.maxClicks),
                  })}
                </span>
              ) : null}
              {showTimeLimit ? (
                <span className="caster-clicker-runtime-limit">
                  {t("clicker.limits.progressTime", {
                    elapsed: formatLimitClock(editor.metrics?.elapsedMs ?? 0),
                    max: formatLimitClock(Number(editor.maxDurationSec) * 1000),
                  })}
                </span>
              ) : null}
              {(editor.metrics?.filterBlockedTicks ?? 0) > 0 ? (
                <span className="caster-clicker-runtime-blocked">
                  {t("clicker.toolbar.runtimeBlocked", {
                    n: editor.metrics?.filterBlockedTicks ?? 0,
                  })}
                </span>
              ) : null}
              {sessionPaused ? (
                <span className="caster-clicker-runtime-paused">
                  {t("clicker.toolbar.runtimePaused")}
                </span>
              ) : null}
            </span>
          ) : null}
          {editor.running ? (
            <button
              type="button"
              className="caster-titlebar-btn caster-btn caster-btn-ghost"
              title={
                sessionPaused
                  ? t("clicker.toolbar.resumeSession")
                  : t("clicker.toolbar.pauseSession", { hint: pauseHint })
              }
              onClick={() =>
                void (sessionPaused ? editor.onResume() : editor.onPause())
              }
            >
              {sessionPaused ? (
                <Play size={14} aria-hidden />
              ) : (
                <Pause size={14} aria-hidden />
              )}
              {sessionPaused
                ? t("clicker.toolbar.resume")
                : t("clicker.toolbar.pause")}
            </button>
          ) : null}
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-danger-ghost"
            disabled={!editor.running}
            onClick={() => void editor.onStop()}
          >
            {t("clicker.toolbar.stop")}
          </button>
          <DropdownMenu
            label={t("clicker.toolbar.moreActions")}
            ariaLabel={t("clicker.toolbar.moreActions")}
            align="end"
            disabled={editor.running || editor.editDisabled}
            triggerClassName="caster-titlebar-btn caster-btn caster-btn-ghost"
            items={moreItems}
          >
            <MoreHorizontal size={16} aria-hidden />
          </DropdownMenu>
        </>
      }
    />
  );
}

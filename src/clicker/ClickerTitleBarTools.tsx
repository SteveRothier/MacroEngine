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
  Lock,
  LockOpen,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  Redo2,
  Save,
  Square,
  Undo2,
  Upload,
} from "lucide-react";
import {
  ContextMenu,
  DisplayPopover,
  DropdownMenu,
  EditorToolbar,
  Tooltip,
  findMenuItem,
  useContextMenuState,
  useToast,
} from "../ui/shell";
import type { DropdownEntry, MenuItemDef } from "../ui/shell";
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
  /** Nom — toolbar start (same as macros). */
  meta?: ReactNode;
  /** Raccourci chip — same group as Processus. */
  metaTools?: ReactNode;
  onOpenProcessSettings?: () => void;
};

function displayOptionLabel(d: DisplayDto, primarySuffix: string): string {
  const title = d.label?.trim() || `Écran`;
  const meta = `${d.width}×${d.height}`;
  const base = `${title} · ${meta}`;
  return d.isPrimary ? `${base}${primarySuffix}` : base;
}

export function ClickerTitleBarTools({
  editor,
  onBack,
  hotkeys,
  onSavedAsNew,
  meta,
  metaTools,
  onOpenProcessSettings,
}: Props) {
  const t = useT();
  const toast = useToast();
  const toolbarCtx = useContextMenuState();
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
  const displayDisabled = editor.running;
  const mutateDisabled = editor.editDisabled;

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

  const toggleLock = () => {
    void (async () => {
      const id = editor.selectedPreset;
      if (!id) return;
      const nextLocked = !editor.locked;
      try {
        await invoke("set_library_item_locked_cmd", {
          kind: "clicker",
          id,
          locked: nextLocked,
        });
        editor.setLocked(nextLocked);
        toast.success(
          nextLocked
            ? t("automations.toast.locked")
            : t("automations.toast.unlocked"),
        );
      } catch (e) {
        toast.error(
          typeof e === "string" ? e : t("automations.toast.lockFail"),
        );
      }
    })();
  };

  const moreItems: DropdownEntry[] = [
    ...(editor.selectedPreset
      ? ([
          {
            id: "lock-toggle",
            label: editor.locked
              ? t("clicker.toolbar.unlockTitle")
              : t("clicker.toolbar.lockTitle"),
            icon: editor.locked ? (
              <LockOpen size={14} />
            ) : (
              <Lock size={14} />
            ),
            onSelect: toggleLock,
          },
          { id: "sep-lock", label: "", separator: true },
        ] satisfies DropdownEntry[])
      : []),
    {
      id: "save-now",
      label: t("clicker.toolbar.saveNow"),
      icon: <Save size={14} />,
      disabled: mutateDisabled,
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
      disabled: mutateDisabled,
      onSelect: () => void saveAsNew(),
    },
    {
      id: "templates",
      label: t("clicker.toolbar.templates"),
      icon: <LayoutTemplate size={14} />,
      disabled: mutateDisabled,
      submenu: templateItems,
    },
    { id: "sep-io", label: "", separator: true },
    {
      id: "import",
      label: t("clicker.toolbar.import"),
      icon: <Upload size={14} />,
      disabled: mutateDisabled,
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

  const contextItems: MenuItemDef[] = [
    ...(moreItems as MenuItemDef[]),
    { id: "sep-ctx-run", label: "", separator: true },
    {
      id: "start",
      label: t("clicker.toolbar.start"),
      icon: <Play size={14} />,
      disabled: editor.running,
      onSelect: () => void editor.onStart(),
    },
    {
      id: "back",
      label: t("clicker.toolbar.back"),
      icon: <ArrowLeft size={14} />,
      onSelect: onBack,
    },
  ];

  return (
    <>
    <EditorToolbar
      onContextMenu={toolbarCtx.openFromEvent}
      start={
        <>
          <Tooltip content={t("clicker.toolbar.back")}>
            <button
              type="button"
              className="caster-titlebar-btn caster-titlebar-icon-btn"
              onClick={onBack}
              aria-label={t("clicker.toolbar.back")}
            >
              <ArrowLeft size={14} aria-hidden />
            </button>
          </Tooltip>
          {meta}
        </>
      }
      end={
        <>
          <div className="caster-toolbar-group">
            <div className="caster-toolbar-menu">
              <Tooltip
                content={
                  displayMissing
                    ? t("clicker.zones.displayMissing")
                    : activeDisplay
                      ? displayOptionLabel(
                          activeDisplay,
                          t("clicker.zones.primarySuffix"),
                        )
                      : t("clicker.zones.displayAria")
                }
                disabled={displayOpen}
              >
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
              </Tooltip>
              <DisplayPopover
                open={displayOpen}
                onClose={() => setDisplayOpen(false)}
                anchorRef={displayBtnRef}
                labelledBy={displayTitleId}
              >
                <div className="caster-display-popover-panel">
                  <p
                    id={displayTitleId}
                    className="caster-display-popover-title"
                  >
                    {t("clicker.zones.displayAria")}
                  </p>
                  {displayMissing ? (
                    <p className="caster-display-popover-warn">
                      {t("clicker.zones.displayMissing")}
                    </p>
                  ) : null}
                  <div
                    className="caster-segmented caster-segmented--wide caster-display-popover-segmented"
                    role="radiogroup"
                    aria-labelledby={displayTitleId}
                  >
                    {editor.displays.map((d) => {
                      const selected = d.id === editor.activeDisplayId;
                      const scale = Math.round(d.scaleFactor * 100);
                      const title =
                        d.label?.trim() || `${d.width}×${d.height}`;
                      const tip = displayOptionLabel(
                        d,
                        t("clicker.zones.primarySuffix"),
                      );
                      return (
                        <button
                          key={d.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          title={tip}
                          className={[
                            "caster-segmented-btn",
                            selected ? "active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            void editor.onSelectDisplay(d.id);
                            setDisplayOpen(false);
                          }}
                        >
                          <span className="caster-display-segment-label">
                            {title}
                            {d.isPrimary
                              ? ` · ${t("clicker.zones.primaryBadge")}`
                              : ""}
                          </span>
                          <span className="caster-display-segment-meta">
                            {d.width}×{d.height}
                            {scale !== 100 ? ` · ${scale}%` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </DisplayPopover>
            </div>
            {metaTools}
            <ProcessFilterTool
              filter={editor.processFilter}
              mode={editor.presetFilterMode}
              onModeChange={editor.setPresetFilterMode}
              localFilter={editor.localProcessFilter}
              onLocalFilterChange={editor.setLocalProcessFilter}
              disabled={editor.locked}
              onOpenSettings={onOpenProcessSettings}
              onGlobalFilterChange={editor.setGlobalProcessFilter}
              presets={editor.processFilterPresets}
              onPresetsChange={editor.setProcessFilterPresets}
            />
          </div>
          <span className="caster-toolbar-sep" aria-hidden />
          <div className="caster-toolbar-group">
            <Tooltip content={t("clicker.toolbar.undoTitle")}>
              <button
                type="button"
                className="caster-titlebar-btn caster-titlebar-icon-btn"
                disabled={!editor.canUndo || editor.editDisabled}
                aria-label={t("clicker.toolbar.undo")}
                onClick={() => editor.undoConfig()}
              >
                <Undo2 size={14} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip content={t("clicker.toolbar.redoTitle")}>
              <button
                type="button"
                className="caster-titlebar-btn caster-titlebar-icon-btn"
                disabled={!editor.canRedo || editor.editDisabled}
                aria-label={t("clicker.toolbar.redo")}
                onClick={() => editor.redoConfig()}
              >
                <Redo2 size={14} aria-hidden />
              </button>
            </Tooltip>
          </div>
          <span className="caster-toolbar-sep" aria-hidden />
          <div className="caster-toolbar-group">
            <Tooltip content={hotkeyHint}>
              <button
                type="button"
                className="caster-titlebar-btn caster-btn caster-btn-primary"
                disabled={editor.running}
                aria-label={t("clicker.toolbar.start")}
                onClick={() => void editor.onStart()}
              >
                {t("clicker.toolbar.start")}
              </button>
            </Tooltip>
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
                      max: formatLimitClock(
                        Number(editor.maxDurationSec) * 1000,
                      ),
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
              <Tooltip
                content={
                  sessionPaused
                    ? t("clicker.toolbar.resumeSession")
                    : t("clicker.toolbar.pauseSession", { hint: pauseHint })
                }
              >
                <button
                  type="button"
                  className="caster-titlebar-btn caster-titlebar-icon-btn"
                  aria-label={
                    sessionPaused
                      ? t("clicker.toolbar.resume")
                      : t("clicker.toolbar.pause")
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
                </button>
              </Tooltip>
            ) : null}
            <Tooltip content={t("clicker.toolbar.stop")}>
              <button
                type="button"
                className="caster-titlebar-btn caster-titlebar-icon-btn caster-titlebar-icon-btn-danger"
                disabled={!editor.running}
                aria-label={t("clicker.toolbar.stop")}
                onClick={() => void editor.onStop()}
              >
                <Square size={14} aria-hidden />
              </button>
            </Tooltip>
          </div>
          <span className="caster-toolbar-sep" aria-hidden />
          <div className="caster-toolbar-group">
            <DropdownMenu
              label={t("clicker.toolbar.moreActions")}
              ariaLabel={t("clicker.toolbar.moreActions")}
              align="end"
              disabled={editor.running}
              triggerClassName={[
                "caster-titlebar-btn",
                "caster-titlebar-icon-btn",
                editor.locked ? "caster-clicker-lock" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              items={moreItems}
            >
              <MoreHorizontal size={16} aria-hidden />
            </DropdownMenu>
          </div>
        </>
      }
    />
    <ContextMenu
      open={toolbarCtx.open}
      x={toolbarCtx.x}
      y={toolbarCtx.y}
      items={contextItems}
      onClose={toolbarCtx.close}
      onSelect={(id) => findMenuItem(contextItems, id)?.onSelect?.()}
      ariaLabel={t("clicker.toolbar.moreActions")}
    />
    </>
  );
}

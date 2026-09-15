import {
  ArrowLeft,
  Download,
  LayoutTemplate,
  MoreHorizontal,
  Pause,
  Play,
  Redo2,
  Save,
  Undo2,
  Upload,
} from "lucide-react";
import { DropdownMenu, EditorToolbar, useToast } from "../ui/shell";
import type { DropdownEntry } from "../ui/shell";
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
import type { ClickerEditor } from "./useClickerEditor";

type Props = {
  editor: ClickerEditor;
  onBack: () => void;
  hotkeys: HotkeyBindings;
};

export function ClickerTitleBarTools({ editor, onBack, hotkeys }: Props) {
  const t = useT();
  const toast = useToast();
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
      id: "templates",
      label: t("clicker.toolbar.templates"),
      items: CLICKER_TEMPLATES.map((tpl) => {
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
      }),
    },
    { id: "sep-io", label: "", separator: true },
    {
      id: "import",
      label: t("clicker.toolbar.import"),
      icon: <Upload size={14} />,
      onSelect: () => void editor.onImportPreset(),
    },
    {
      id: "export",
      label: t("clicker.toolbar.export"),
      icon: <Download size={14} />,
      onSelect: () => void editor.onExportPreset(),
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
          <input
            className="caster-titlebar-name-input"
            value={editor.presetName}
            disabled={editor.editDisabled || !editor.selectedPreset}
            placeholder={t("clicker.toolbar.presetName")}
            aria-label={t("clicker.toolbar.presetName")}
            onChange={(e) => editor.setPresetName(e.target.value)}
            onBlur={(e) => void editor.onRenamePreset(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
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
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-ghost"
            disabled={!editor.canUndo || editor.editDisabled}
            title={t("clicker.toolbar.undo")}
            onClick={() => editor.undoConfig()}
          >
            <Undo2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="caster-titlebar-btn caster-btn caster-btn-ghost"
            disabled={!editor.canRedo || editor.editDisabled}
            title={t("clicker.toolbar.redo")}
            onClick={() => editor.redoConfig()}
          >
            <Redo2 size={14} aria-hidden />
          </button>
          {editor.metrics ? (
            <span
              className="caster-clicker-title-metrics"
              title={t("clicker.toolbar.targetCps", {
                cps: editor.metrics.targetCps.toFixed(1),
              })}
            >
              <strong>{editor.metrics.measuredCps.toFixed(1)}</strong> cps
              <span aria-hidden> · </span>
              {editor.metrics.clicksEmitted}
            </span>
          ) : null}
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

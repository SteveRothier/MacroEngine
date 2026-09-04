import { ArrowLeft, Pause, Play, Redo2, Undo2 } from "lucide-react";
import { AddMenu } from "../ui";
import { useToast } from "../ui/v2";
import {
  chordLabel,
  triggerHotkeyLabel,
  vkLabel,
  type HotkeyBindings,
} from "../macros/types";
import { CLICKER_TEMPLATES } from "./clickerTemplates";
import type { ClickerEditor } from "./useClickerEditor";

type Props = {
  editor: ClickerEditor;
  onBack: () => void;
  hotkeys: HotkeyBindings;
};

export function ClickerTitleBarTools({ editor, onBack, hotkeys }: Props) {
  const toast = useToast();
  const presetTriggerHint =
    editor.trigger.type === "hotkey"
      ? `Déclencheur ${triggerHotkeyLabel(editor.trigger)}`
      : null;
  const hotkeyHint =
    presetTriggerHint ??
    `Raccourci ${chordLabel(hotkeys)} · ${
      editor.mode === "toggle" ? "Basculer" : "Maintenir"
    }`;
  const sessionPaused = editor.sessionPaused;
  const pauseHint = hotkeys.pauseVk
    ? ` (${vkLabel(hotkeys.pauseVk)})`
    : "";

  return (
    <div className="v2-editor-toolbar">
      <button
        type="button"
        className="v2-titlebar-btn v2-btn v2-btn-ghost"
        onClick={onBack}
        title="Retour aux automations"
      >
        <ArrowLeft size={14} aria-hidden />
      </button>
      <input
        className="v2-titlebar-name-input"
        value={editor.presetName}
        disabled={editor.editDisabled || !editor.selectedPreset}
        placeholder="Nom du preset"
        aria-label="Nom du preset"
        onChange={(e) => editor.setPresetName(e.target.value)}
        onBlur={(e) => void editor.onRenamePreset(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {editor.locked ? (
        <span className="v2-clicker-lock" title="Preset verrouillé">
          Verrouillé
        </span>
      ) : null}
      <div className="v2-editor-toolbar-spacer" />
      <button
        type="button"
        className="v2-titlebar-btn v2-btn v2-btn-ghost"
        disabled={!editor.canUndo || editor.editDisabled}
        title="Annuler (Ctrl+Z)"
        onClick={() => editor.undoConfig()}
      >
        <Undo2 size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="v2-titlebar-btn v2-btn v2-btn-ghost"
        disabled={!editor.canRedo || editor.editDisabled}
        title="Rétablir (Ctrl+Y)"
        onClick={() => editor.redoConfig()}
      >
        <Redo2 size={14} aria-hidden />
      </button>
      {editor.metrics ? (
        <span
          className="v2-clicker-title-metrics"
          title={`Cible : ${editor.metrics.targetCps.toFixed(1)} CPS`}
        >
          <strong>{editor.metrics.measuredCps.toFixed(1)}</strong> cps
          <span aria-hidden> · </span>
          {editor.metrics.clicksEmitted}
        </span>
      ) : null}
      <button
        type="button"
        className="v2-titlebar-btn v2-btn v2-btn-primary"
        disabled={editor.running}
        title={hotkeyHint}
        onClick={() => void editor.onStart()}
      >
        Démarrer
      </button>
      {editor.running ? (
        <button
          type="button"
          className="v2-titlebar-btn v2-btn v2-btn-ghost"
          title={
            sessionPaused
              ? "Reprendre la session"
              : `Pause session${pauseHint}`
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
          {sessionPaused ? " Reprendre" : " Pause"}
        </button>
      ) : null}
      <button
        type="button"
        className="v2-titlebar-btn v2-btn v2-btn-danger-ghost"
        onClick={() => void editor.onStop()}
      >
        Arrêter
      </button>
      <AddMenu
        label="⋯"
        disabled={editor.running || editor.editDisabled}
        items={[
          {
            id: "save-now",
            label: "Enregistrer maintenant",
            onSelect: () => {
              void editor.onSavePreset().then(
                () => toast.success("Preset enregistré"),
                (e: unknown) => {
                  const msg =
                    typeof e === "string"
                      ? e
                      : e && typeof e === "object" && "message" in e
                        ? String((e as { message?: unknown }).message)
                        : "Échec de l’enregistrement";
                  toast.error(msg);
                },
              );
            },
          },
          {
            id: "tpl-group",
            label: "Modèles",
            items: CLICKER_TEMPLATES.map((t) => ({
              id: `tpl-${t.id}`,
              label: t.label,
              onSelect: () => {
                editor.applyTemplate(t.build());
                toast.success(`Modèle appliqué · ${t.label}`);
              },
            })),
          },
          {
            id: "import",
            label: "Importer…",
            onSelect: () => void editor.onImportPreset(),
          },
          {
            id: "export",
            label: "Exporter…",
            onSelect: () => void editor.onExportPreset(),
          },
        ]}
      />
    </div>
  );
}

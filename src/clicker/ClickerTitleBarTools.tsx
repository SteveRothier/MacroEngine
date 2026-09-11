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
import { DropdownMenu, EditorToolbar, useToast } from "../ui/v2";
import type { DropdownEntry } from "../ui/v2";
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

  const moreItems: DropdownEntry[] = [
    {
      id: "save-now",
      label: "Enregistrer maintenant",
      icon: <Save size={14} />,
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
      id: "templates",
      label: "Modèles",
      items: CLICKER_TEMPLATES.map((t) => ({
        id: `tpl-${t.id}`,
        label: t.label,
        icon: <LayoutTemplate size={14} />,
        onSelect: () => {
          editor.applyTemplate(t.build());
          toast.success(`Modèle appliqué · ${t.label}`);
        },
      })),
    },
    { id: "sep-io", label: "", separator: true },
    {
      id: "import",
      label: "Importer…",
      icon: <Upload size={14} />,
      onSelect: () => void editor.onImportPreset(),
    },
    {
      id: "export",
      label: "Exporter…",
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
        </>
      }
      end={
        <>
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
          <DropdownMenu
            label="Plus d’actions"
            ariaLabel="Plus d’actions"
            align="end"
            disabled={editor.running || editor.editDisabled}
            triggerClassName="v2-titlebar-btn v2-btn v2-btn-ghost"
            items={moreItems}
          >
            <MoreHorizontal size={16} aria-hidden />
          </DropdownMenu>
        </>
      }
    />
  );
}

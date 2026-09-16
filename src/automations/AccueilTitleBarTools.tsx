import { Undo2, Redo2 } from "lucide-react";
import { useT } from "../i18n";
import { EditorToolbar } from "../ui/shell";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function AccueilTitleBarTools({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const t = useT();
  return (
    <EditorToolbar
      aria-label={t("automations.toolbar.aria")}
      end={
        <>
          <button
            type="button"
            className="caster-titlebar-btn caster-titlebar-icon-btn"
            disabled={!canUndo}
            onClick={onUndo}
            title={t("automations.toolbar.undoTitle")}
            aria-label={t("automations.toolbar.undo")}
          >
            <Undo2 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="caster-titlebar-btn caster-titlebar-icon-btn"
            disabled={!canRedo}
            onClick={onRedo}
            title={t("automations.toolbar.redoTitle")}
            aria-label={t("automations.toolbar.redo")}
          >
            <Redo2 size={14} aria-hidden />
          </button>
        </>
      }
    />
  );
}

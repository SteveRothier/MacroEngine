import type { ReactNode } from "react";

type Props = {
  /** Leading controls (back, title, dirty). */
  start?: ReactNode;
  /** Primary actions (run, stop, save). */
  center?: ReactNode;
  /** Trailing overflow / extras. */
  end?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * Shared editor chrome layout for Macro / Clicker / Script toolbars.
 * Portaled into `.v2-editor-toolbar-host` via TitleBarSlot.
 */
export function EditorToolbar({
  start,
  center,
  end,
  className,
  "aria-label": ariaLabel = "Barre d’outils éditeur",
}: Props) {
  return (
    <div
      className={["v2-editor-toolbar", className].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label={ariaLabel}
    >
      {start ? <div className="v2-editor-toolbar-start">{start}</div> : null}
      {center ? (
        <div className="v2-editor-toolbar-center">{center}</div>
      ) : (
        <div className="v2-editor-toolbar-spacer" aria-hidden />
      )}
      {end ? <div className="v2-editor-toolbar-end">{end}</div> : null}
    </div>
  );
}

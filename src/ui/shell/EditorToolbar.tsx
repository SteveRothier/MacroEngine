import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

const COMPACT_WIDTH_PX = 780;

type Props = {
  /** Leading controls (back, title, dirty). */
  start?: ReactNode;
  /** Primary actions (run, stop, save). */
  center?: ReactNode;
  /** Trailing overflow / extras. */
  end?: ReactNode;
  className?: string;
  "aria-label"?: string;
  /** Right-click menu (skipped on editable fields so native menus still work). */
  onContextMenu?: (e: ReactMouseEvent<HTMLDivElement>) => void;
};

function isEditableContextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable=true]",
    ),
  );
}

/**
 * Shared editor chrome layout for Macro / Clicker / Script toolbars.
 * Portaled into `.caster-editor-toolbar-host` via TitleBarSlot.
 */
export function EditorToolbar({
  start,
  center,
  end,
  className,
  "aria-label": ariaLabel = "Barre d’outils éditeur",
  onContextMenu,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = (width: number) => {
      setCompact(width < COMPACT_WIDTH_PX);
    };
    update(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") update(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className={["caster-editor-toolbar", className].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label={ariaLabel}
      data-density={compact ? "compact" : "comfortable"}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        if (isEditableContextTarget(e.target)) return;
        onContextMenu(e);
      }}
    >
      {start ? <div className="caster-editor-toolbar-start">{start}</div> : null}
      {center ? (
        <div className="caster-editor-toolbar-center">{center}</div>
      ) : (
        <div className="caster-editor-toolbar-spacer" aria-hidden />
      )}
      {end ? <div className="caster-editor-toolbar-end">{end}</div> : null}
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTitleBarDispatch } from "./TitleBarContext";

const LIB_MIN = 190;
const LIB_MAX = 360;
const LIB_DEFAULT = 250;

type Props = {
  titleBar: ReactNode;
  library?: ReactNode;
  execBar?: ReactNode;
  console?: ReactNode;
  statusBar?: ReactNode;
  children: ReactNode;
  rootClassName?: string;
  density?: "comfortable" | "compact";
  fontScale?: number;
  accent?: "lavender" | "default" | "blue" | "teal";
  reduceMotion?: boolean;
  libraryWidth?: number;
  onLibraryWidthChange?: (width: number) => void;
};

function clampLib(w: number): number {
  return Math.max(LIB_MIN, Math.min(LIB_MAX, Math.round(w)));
}

export function AppShell({
  titleBar,
  library,
  execBar,
  console: consolePanel,
  statusBar,
  children,
  rootClassName,
  density = "comfortable",
  fontScale = 1,
  accent = "lavender",
  reduceMotion = false,
  libraryWidth,
  onLibraryWidthChange,
}: Props) {
  const titleBarDispatch = useTitleBarDispatch();
  const toolbarHostRef = useCallback(
    (el: HTMLDivElement | null) => {
      titleBarDispatch?.setSubToolbarHost(el);
    },
    [titleBarDispatch],
  );
  const [width, setWidth] = useState(() =>
    clampLib(libraryWidth ?? LIB_DEFAULT),
  );
  const widthRef = useRef(width);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof libraryWidth === "number") {
      const next = clampLib(libraryWidth);
      widthRef.current = next;
      setWidth(next);
    }
  }, [libraryWidth]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !library) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      if (
        w >= 900 &&
        w < 1200 &&
        widthRef.current >= 240 &&
        widthRef.current <= 260
      ) {
        const next = 220;
        widthRef.current = next;
        setWidth(next);
        onLibraryWidthChange?.(next);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [library, onLibraryWidthChange]);

  const onSplitterPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!library) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startW: widthRef.current };
      document.body.classList.add("is-lib-resizing");
    },
    [library],
  );

  const onSplitterPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = clampLib(drag.startW + (e.clientX - drag.startX));
      widthRef.current = next;
      setWidth(next);
    },
    [],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.classList.remove("is-lib-resizing");
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onLibraryWidthChange?.(widthRef.current);
    },
    [onLibraryWidthChange],
  );

  const hasLibrary = Boolean(library);

  return (
    <div
      ref={rootRef}
      className={["caster-root", rootClassName].filter(Boolean).join(" ")}
      data-density={density}
      data-accent={accent}
      data-reduce-motion={reduceMotion ? "true" : undefined}
      data-has-library={hasLibrary ? "true" : undefined}
      style={
        {
          fontSize: `${fontScale * 100}%`,
          ...(hasLibrary
            ? { ["--caster-library-w" as string]: `${width}px` }
            : null),
        } as CSSProperties
      }
    >
      {hasLibrary ? (
        <>
          <aside className="caster-library-pane">{library}</aside>
          <div
            className="caster-library-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={LIB_MIN}
            aria-valuemax={LIB_MAX}
            aria-valuenow={width}
            tabIndex={0}
            onPointerDown={onSplitterPointerDown}
            onPointerMove={onSplitterPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                const next = clampLib(width - 8);
                widthRef.current = next;
                setWidth(next);
                onLibraryWidthChange?.(next);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                const next = clampLib(width + 8);
                widthRef.current = next;
                setWidth(next);
              }
            }}
          />
        </>
      ) : null}
      <div className="caster-content">
        <div className="caster-titlebar-shell">{titleBar}</div>
        <div
          className="caster-editor-toolbar-strip"
          ref={toolbarHostRef}
        />
        <div className="caster-main">
          <div className="caster-stage">{children}</div>
          {execBar ? (
            <div className="caster-exec-bar-host">{execBar}</div>
          ) : null}
          {consolePanel ? (
            <div className="caster-console-host">{consolePanel}</div>
          ) : null}
          {statusBar ? (
            <div className="caster-status-bar-host">{statusBar}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

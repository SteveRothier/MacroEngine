import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useT, type AppLocale } from "../i18n";
import {
  ContextMenu,
  useContextMenuState,
  type MenuItemDef,
} from "../ui/v2";

export type ConsoleLevel = "info" | "error" | "session";

export type ConsoleLine = {
  id: number;
  time: string;
  level: ConsoleLevel;
  text: string;
};

type Props = {
  scriptId: string;
  lines: ConsoleLine[];
  onClear: () => void;
};

function storageKey(scriptId: string, suffix: string) {
  return `caster.script.${suffix}.${scriptId}`;
}

function readCollapsed(scriptId: string): boolean {
  try {
    return localStorage.getItem(storageKey(scriptId, "consoleCollapsed")) === "1";
  } catch {
    return false;
  }
}

function readHeight(scriptId: string): number {
  try {
    const n = Number(localStorage.getItem(storageKey(scriptId, "consoleHeight")));
    return Number.isFinite(n) && n >= 80 ? n : 140;
  } catch {
    return 140;
  }
}

function localeTag(locale: AppLocale): string {
  return locale === "en" ? "en-US" : "fr-FR";
}

export function classifyConsoleMessage(msg: string): ConsoleLevel {
  if (/erreur|error|échoué|failed|disabled/i.test(msg)) return "error";
  if (
    /script «|exécution autonome|fin script|annulation|démarrage|session/i.test(
      msg,
    )
  ) {
    return "session";
  }
  return "info";
}

export function formatConsoleTime(
  d = new Date(),
  locale: AppLocale = "fr",
): string {
  return d.toLocaleTimeString(localeTag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function ScriptConsole({ scriptId, lines, onClear }: Props) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(scriptId));
  const [height, setHeight] = useState(() => readHeight(scriptId));
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const ctxMenu = useContextMenuState();

  const clearItems = useMemo<MenuItemDef[]>(
    () => [{ id: "clear", label: t("scripts.console.clearMenu") }],
    [t],
  );

  useEffect(() => {
    setCollapsed(readCollapsed(scriptId));
    setHeight(readHeight(scriptId));
  }, [scriptId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(scriptId, "consoleCollapsed"),
        collapsed ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [collapsed, scriptId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(scriptId, "consoleHeight"),
        String(height),
      );
    } catch {
      /* ignore */
    }
  }, [height, scriptId]);

  useEffect(() => {
    if (collapsed || !stickRef.current) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, collapsed]);

  const errorCount = lines.filter((l) => l.level === "error").length;

  const onBodyScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stickRef.current = atBottom;
  }, []);

  function onSplitterPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const parent = layoutRef.current?.parentElement;
    const maxH = parent
      ? Math.max(80, Math.floor(parent.clientHeight * 0.4))
      : 320;

    const onMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY;
      const next = Math.min(maxH, Math.max(80, startH + delta));
      setHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="v2-script-console-wrap" ref={layoutRef}>
      {!collapsed ? (
        <div
          className="v2-script-console-splitter"
          onPointerDown={onSplitterPointerDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("scripts.console.resizeAria")}
        />
      ) : null}
      <div
        className={[
          "v2-script-console",
          collapsed ? "is-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={collapsed ? undefined : { height }}
        onContextMenu={ctxMenu.openFromEvent}
      >
        <div className="v2-script-console-head">
          <span>{t("scripts.console.title")}</span>
          <div className="v2-script-console-head-actions">
            {errorCount > 0 ? (
              <span
                className="v2-script-console-errors"
                title={t("scripts.console.errorsTip")}
              >
                ● {errorCount}
              </span>
            ) : null}
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              onClick={onClear}
            >
              {t("scripts.console.clear")}
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              aria-expanded={!collapsed}
              aria-label={
                collapsed
                  ? t("scripts.console.expand")
                  : t("scripts.console.collapse")
              }
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? (
                <ChevronUp size={14} aria-hidden />
              ) : (
                <ChevronDown size={14} aria-hidden />
              )}
            </button>
          </div>
        </div>
        {!collapsed ? (
          <div
            className="v2-script-console-body"
            ref={bodyRef}
            onScroll={onBodyScroll}
            aria-live="polite"
          >
            {lines.length === 0 ? (
              <p className="v2-script-console-empty">
                {t("scripts.console.empty")}
              </p>
            ) : (
              lines.map((line) => (
                <div
                  key={line.id}
                  className={`v2-script-console-line is-${line.level}`}
                >
                  <span className="v2-script-console-time">{line.time}</span>
                  <span className="v2-script-console-msg">{line.text}</span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={clearItems}
        onClose={ctxMenu.close}
        onSelect={(id) => {
          if (id === "clear") onClear();
        }}
        ariaLabel={t("scripts.console.menuAria")}
      />
    </div>
  );
}

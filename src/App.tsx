import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { MainApp } from "./app/MainApp";
import { ErrorBoundary } from "./ui/shell/ErrorBoundary";
import { ZoneOverlayView } from "./clicker/ZoneOverlayView";
import { type EngineStatus } from "./macros/types";
import { applyTheme, readStoredTheme } from "./theme";
import { LocaleProvider, useT } from "./i18n";
import { mergeShellPrefs } from "./settings/settingsTypes";
import "./App.css";
import "./ui/shell/tokens.css";
import "./ui/shell/shell.css";

function OverlayView() {
  const prefs = mergeShellPrefs();
  return (
    <LocaleProvider preference={prefs.uiLocale}>
      <OverlayInner />
    </LocaleProvider>
  );
}

type OverlayMetrics = {
  measuredCps: number;
  clicksEmitted: number;
  elapsedMs: number;
};

function formatOverlayClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function OverlayInner() {
  const t = useT();
  const [status, setStatus] = useState<EngineStatus>({
    state: "idle",
    cancelled: false,
    message: null,
  });
  const [metrics, setMetrics] = useState<OverlayMetrics>({
    measuredCps: 0,
    clicksEmitted: 0,
    elapsedMs: 0,
  });
  const [opacity, setOpacity] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void invoke<{ overlayOpacity?: number }>("get_settings")
      .then((s) => {
        if (typeof s.overlayOpacity === "number") setOpacity(s.overlayOpacity);
      })
      .catch(() => undefined);
    let un: (() => void) | undefined;
    void listen<number>("overlay://opacity", (e) => {
      if (typeof e.payload === "number") setOpacity(e.payload);
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await invoke<EngineStatus>("get_engine_state");
        const m = await invoke<OverlayMetrics>("get_clicker_metrics");
        if (!alive) return;
        setStatus(s);
        setMetrics({
          measuredCps: m.measuredCps,
          clicksEmitted: m.clicksEmitted,
          elapsedMs: m.elapsedMs,
        });
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 250);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const paused = status.state === "paused";
  const active =
    (status.state === "running" || paused) && status.sessionKind === "clicker";
  const stateLabel = paused
    ? t("labels.paused")
    : active
      ? t("common.running")
      : t("common.inactive");

  const runControl = async (cmd: "pause_clicker" | "resume_clicker" | "request_cancel") => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await invoke<EngineStatus>(cmd);
      setStatus(next);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={[
        "overlay",
        "caster-root",
        active ? "overlay--session" : "",
        paused ? "overlay--paused" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ opacity }}
      role="group"
      aria-label={t("clicker.overlay.focusAria")}
    >
      <button
        type="button"
        className="overlay-main"
        title={t("clicker.overlay.focusHint")}
        aria-label={t("clicker.overlay.focusAria")}
        onClick={() => {
          void invoke("focus_main_window").catch(() => undefined);
        }}
      >
        <span
          className={[
            "overlay-state",
            paused ? "is-paused" : active ? "is-running" : "is-idle",
          ].join(" ")}
        >
          {stateLabel}
        </span>
        {active ? (
          <span className="overlay-metrics">
            {t("clicker.overlay.clicks", { n: metrics.clicksEmitted })}
            <span className="overlay-sep" aria-hidden>
              ·
            </span>
            {formatOverlayClock(metrics.elapsedMs)}
            <span className="overlay-sep" aria-hidden>
              ·
            </span>
            {t("clicker.overlay.cps", {
              cps: metrics.measuredCps.toFixed(1),
            })}
          </span>
        ) : (
          <span className="overlay-metrics overlay-metrics--idle">
            {t("clicker.overlay.idleHint")}
          </span>
        )}
      </button>
      {active ? (
        <div className="overlay-actions" role="group" aria-label={t("clicker.overlay.controlsAria")}>
          <button
            type="button"
            className="overlay-btn"
            disabled={busy}
            title={
              paused
                ? t("clicker.overlay.resume")
                : t("clicker.overlay.pause")
            }
            aria-label={
              paused
                ? t("clicker.overlay.resume")
                : t("clicker.overlay.pause")
            }
            onClick={(e) => {
              e.stopPropagation();
              void runControl(paused ? "resume_clicker" : "pause_clicker");
            }}
          >
            {paused ? t("clicker.overlay.resumeShort") : t("clicker.overlay.pauseShort")}
          </button>
          <button
            type="button"
            className="overlay-btn overlay-btn--stop"
            disabled={busy}
            title={t("clicker.overlay.stop")}
            aria-label={t("clicker.overlay.stop")}
            onClick={(e) => {
              e.stopPropagation();
              void runControl("request_cancel");
            }}
          >
            {t("clicker.overlay.stopShort")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PickOverlayView() {
  const prefs = mergeShellPrefs();
  return (
    <LocaleProvider preference={prefs.uiLocale}>
      <PickOverlayInner />
    </LocaleProvider>
  );
}

function PickOverlayInner() {
  const t = useT();
  const [pos, setPos] = useState({ sx: 0, sy: 0 });
  const [mode, setMode] = useState<"point" | "pixel">("point");
  const isPixel = mode === "pixel";

  useEffect(() => {
    document.documentElement.dataset.window = "picker";
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
    void getCurrentWebviewWindow().setBackgroundColor([0, 0, 0, 0]);
    return () => {
      delete document.documentElement.dataset.window;
      document.documentElement.style.background = "";
      document.body.style.background = "";
      if (root) root.style.background = "";
    };
  }, []);

  useEffect(() => {
    let unMode: (() => void) | undefined;
    void listen<string>("picker://mode", (e) => {
      setMode(e.payload === "pixel" ? "pixel" : "point");
    }).then((un) => {
      unMode = un;
    });
    return () => unMode?.();
  }, []);

  useEffect(() => {
    // Pixel mode: overlay is click-through; poll native cursor for the banner/crosshair.
    if (!isPixel) return;
    let alive = true;
    const tick = async () => {
      try {
        const p = await invoke<{ x: number; y: number }>("get_cursor_position");
        if (!alive) return;
        setPos({ sx: p.x, sy: p.y });
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 50);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isPixel]);

  useEffect(() => {
    if (isPixel) return; // clicks handled natively while click-through
    let armed = true;
    let confirming = { current: false };
    const onMove = (e: MouseEvent) => {
      setPos({ sx: e.screenX, sy: e.screenY });
    };
    // Emit-only: never invoke from the picker (hide/pick must run on main).
    const onConfirm = (e: MouseEvent) => {
      if (!armed || confirming.current) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      confirming.current = true;
      window.setTimeout(() => {
        void emit("picker://request-confirm").catch(() => {
          confirming.current = false;
        });
      }, 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!armed || confirming.current) return;
        confirming.current = true;
        window.setTimeout(() => {
          void emit("picker://request-cancel");
        }, 0);
      }
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      if (!armed || confirming.current) return;
      confirming.current = true;
      window.setTimeout(() => {
        void emit("picker://request-cancel");
      }, 0);
    };
    // `click` (not mousedown): avoids tearing down the picker mid-press.
    window.addEventListener("click", onConfirm, true);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContext);
    void emit("picker://ready");
    let unPrepare: (() => void) | undefined;
    void listen("picker://prepare", () => {
      confirming.current = false;
      void emit("picker://ready");
    }).then((un) => {
      unPrepare = un;
    });
    return () => {
      armed = false;
      unPrepare?.();
      window.removeEventListener("click", onConfirm, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onContext);
    };
  }, [isPixel]);

  useEffect(() => {
    if (!isPixel) return;
    void emit("picker://ready");
  }, [isPixel]);

  const title = isPixel ? t("shell.pickPixelTitle") : t("shell.pickTitle");
  const hint = isPixel
    ? t("shell.pickPixelHint", { x: String(pos.sx), y: String(pos.sy) })
    : t("shell.pickHint", { x: String(pos.sx), y: String(pos.sy) });

  // GetCursorPos is screen-absolute; overlay is monitor-local.
  const crossLeft = pos.sx - (typeof window !== "undefined" ? window.screenX : 0);
  const crossTop = pos.sy - (typeof window !== "undefined" ? window.screenY : 0);

  return (
    <div
      className={["pick-overlay", isPixel ? "pick-overlay--pixel" : ""].join(" ")}
      role="dialog"
      aria-label={title}
    >
      <div className="pick-overlay-banner">
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
      {isPixel ? (
        <div
          className="pick-overlay-cross"
          style={{ left: crossLeft, top: crossTop }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function readWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

export default function App() {
  const [label] = useState(readWindowLabel);

  if (label === "overlay") {
    applyTheme(readStoredTheme());
    return <OverlayView />;
  }
  if (label === "picker") {
    return <PickOverlayView />;
  }
  if (label === "zones") {
    const prefs = mergeShellPrefs();
    return (
      <LocaleProvider preference={prefs.uiLocale}>
        <ZoneOverlayView />
      </LocaleProvider>
    );
  }
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

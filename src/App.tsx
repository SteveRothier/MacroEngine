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

type ClickerMetrics = {
  measuredCps: number;
};

function OverlayView() {
  const [status, setStatus] = useState<EngineStatus>({
    state: "idle",
    cancelled: false,
    message: null,
  });
  const [cps, setCps] = useState(0);
  const [opacity, setOpacity] = useState(1);

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
        const m = await invoke<ClickerMetrics>("get_clicker_metrics");
        if (!alive) return;
        setStatus(s);
        setCps(m.measuredCps);
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

  return (
    <div className="overlay caster-root" data-tauri-drag-region style={{ opacity }}>
      <strong>{status.sessionKind ?? status.state}</strong>
      <span>{cps.toFixed(1)} CPS</span>
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

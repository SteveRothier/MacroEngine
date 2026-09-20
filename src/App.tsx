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
    const onMove = (e: MouseEvent) => {
      setPos({ sx: e.screenX, sy: e.screenY });
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void invoke("confirm_screen_pick");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void invoke("cancel_screen_pick");
      }
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      void invoke("cancel_screen_pick");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContext);
    void emit("picker://ready");
    let unPrepare: (() => void) | undefined;
    void listen("picker://prepare", () => {
      void emit("picker://ready");
    }).then((un) => {
      unPrepare = un;
    });
    return () => {
      unPrepare?.();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onContext);
    };
  }, []);

  return (
    <div
      className="pick-overlay"
      role="dialog"
      aria-label={t("shell.pickTitle")}
    >
      <div className="pick-overlay-banner">
        <strong>{t("shell.pickTitle")}</strong>
        <span>
          {t("shell.pickHint", { x: String(pos.sx), y: String(pos.sy) })}
        </span>
      </div>
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
    return <ZoneOverlayView />;
  }
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

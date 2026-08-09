import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type EngineStatus = {
  state: string;
  cancelled: boolean;
  message?: string | null;
};

type ClickerMetrics = {
  clicksEmitted: number;
  targetCps: number;
  measuredCps: number;
  cumulativeDeadlineErrorMs: number;
  elapsedMs: number;
  running: boolean;
};

type MouseButton = "left" | "right" | "middle";
type ClickMode = "hold" | "toggle";
type ClickKind = "single" | "double";
type ClickTarget =
  | { type: "currentCursor" }
  | { type: "fixed"; x: number; y: number };
type StopZone =
  | { type: "corner"; corner: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" }
  | { type: "rect"; x: number; y: number; width: number; height: number };

type AppSettings = {
  clicker: {
    button: MouseButton;
    cps: number;
    mode: ClickMode;
    target: ClickTarget;
    cpsJitter: number;
    clickKind: ClickKind;
    dutyCycle: number;
    maxClicks: number | null;
    maxDurationMs: number | null;
    stopZones: StopZone[];
  };
  advancedUi: boolean;
  overlayVisible: boolean;
};

function OverlayView() {
  const [status, setStatus] = useState("idle");
  const [cps, setCps] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await invoke<EngineStatus>("get_engine_state");
        const m = await invoke<ClickerMetrics>("get_clicker_metrics");
        if (!alive) return;
        setStatus(s.state);
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
    <div className="overlay" data-tauri-drag-region>
      <strong>{status}</strong>
      <span>{cps.toFixed(1)} CPS</span>
    </div>
  );
}

function MainApp() {
  const [status, setStatus] = useState<EngineStatus>({
    state: "idle",
    cancelled: false,
    message: null,
  });
  const [cps, setCps] = useState(10);
  const [button, setButton] = useState<MouseButton>("left");
  const [mode, setMode] = useState<ClickMode>("toggle");
  const [metrics, setMetrics] = useState<ClickerMetrics | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [targetFixed, setTargetFixed] = useState(false);
  const [targetX, setTargetX] = useState(0);
  const [targetY, setTargetY] = useState(0);
  const [jitter, setJitter] = useState(0);
  const [clickKind, setClickKind] = useState<ClickKind>("single");
  const [duty, setDuty] = useState(1);
  const [maxClicks, setMaxClicks] = useState("");
  const [maxDurationSec, setMaxDurationSec] = useState("");
  const [stopTopLeft, setStopTopLeft] = useState(false);
  const [picking, setPicking] = useState(false);

  const buildConfig = useCallback(() => {
    const stopZones: StopZone[] = [];
    if (stopTopLeft) {
      stopZones.push({ type: "corner", corner: "topLeft" });
    }
    return {
      button,
      cps,
      mode,
      target: targetFixed
        ? { type: "fixed" as const, x: targetX, y: targetY }
        : { type: "currentCursor" as const },
      cpsJitter: jitter,
      clickKind,
      dutyCycle: duty,
      maxClicks: maxClicks === "" ? null : Number(maxClicks),
      maxDurationMs: maxDurationSec === "" ? null : Number(maxDurationSec) * 1000,
      stopZones,
    };
  }, [
    button,
    cps,
    mode,
    targetFixed,
    targetX,
    targetY,
    jitter,
    clickKind,
    duty,
    maxClicks,
    maxDurationSec,
    stopTopLeft,
  ]);

  const refresh = useCallback(async () => {
    const next = await invoke<EngineStatus>("get_engine_state");
    setStatus(next);
    const m = await invoke<ClickerMetrics>("get_clicker_metrics");
    setMetrics(m);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const s = await invoke<AppSettings>("get_settings");
        setAdvanced(s.advancedUi);
        setOverlayVisible(s.overlayVisible);
        setCps(s.clicker.cps);
        setButton(s.clicker.button);
        setMode(s.clicker.mode);
        setJitter(s.clicker.cpsJitter ?? 0);
        setClickKind(s.clicker.clickKind ?? "single");
        setDuty(s.clicker.dutyCycle ?? 1);
        setMaxClicks(s.clicker.maxClicks != null ? String(s.clicker.maxClicks) : "");
        setMaxDurationSec(
          s.clicker.maxDurationMs != null ? String(s.clicker.maxDurationMs / 1000) : "",
        );
        if (s.clicker.target?.type === "fixed") {
          setTargetFixed(true);
          setTargetX(s.clicker.target.x);
          setTargetY(s.clicker.target.y);
        }
        setStopTopLeft(
          (s.clicker.stopZones ?? []).some(
            (z) => z.type === "corner" && z.corner === "topLeft",
          ),
        );
      } catch {
        /* first launch */
      }
      await refresh();
    })();

    let unlistenStatus: (() => void) | undefined;
    let unlistenLog: (() => void) | undefined;
    void listen<EngineStatus>("engine://status", () => {
      void refresh();
    }).then((fn) => {
      unlistenStatus = fn;
    });
    void listen<EngineStatus>("engine://log", () => {
      void refresh();
    }).then((fn) => {
      unlistenLog = fn;
    });
    const timer = window.setInterval(() => {
      void refresh();
    }, 250);
    return () => {
      unlistenStatus?.();
      unlistenLog?.();
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function persistUi(nextAdvanced = advanced, nextOverlay = overlayVisible) {
    await invoke("save_app_settings", {
      settings: {
        clicker: buildConfig(),
        advancedUi: nextAdvanced,
        overlayVisible: nextOverlay,
      },
    });
  }

  async function onStart() {
    const next = await invoke<EngineStatus>("start_clicker", {
      request: buildConfig(),
    });
    setStatus(next);
    await refresh();
  }

  async function onStop() {
    const next = await invoke<EngineStatus>("request_cancel");
    setStatus(next);
    await refresh();
  }

  async function onPick() {
    setPicking(true);
    try {
      const p = await invoke<{ x: number; y: number }>("pick_point");
      setTargetFixed(true);
      setTargetX(p.x);
      setTargetY(p.y);
      await persistUi();
    } finally {
      setPicking(false);
    }
  }

  async function onToggleAdvanced() {
    const next = !advanced;
    setAdvanced(next);
    await persistUi(next, overlayVisible);
  }

  async function onToggleOverlay() {
    const next = !overlayVisible;
    setOverlayVisible(next);
    await invoke("set_overlay_visible", { visible: next });
    await persistUi(advanced, next);
  }

  const running = status.state === "running";

  return (
    <main className="container">
      <h1>MacroEngine M1-B</h1>
      <p className="subtitle">Autoclicker — Simple / Advanced</p>

      <div className={`badge state-${status.state}`}>
        État : <strong>{status.state}</strong>
        {status.cancelled ? " · cancelled" : ""}
      </div>

      <div className="panel">
        <label className="field">
          <span>CPS</span>
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            value={cps}
            disabled={running}
            onChange={(e) => setCps(Number(e.target.value))}
          />
        </label>

        <label className="field">
          <span>Bouton</span>
          <select
            value={button}
            disabled={running}
            onChange={(e) => setButton(e.target.value as MouseButton)}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="middle">Middle</option>
          </select>
        </label>

        <label className="field">
          <span>Mode</span>
          <select
            value={mode}
            disabled={running}
            onChange={(e) => setMode(e.target.value as ClickMode)}
          >
            <option value="toggle">Toggle (F6)</option>
            <option value="hold">Hold (F6 maintenu)</option>
          </select>
        </label>
      </div>

      {metrics ? (
        <div className="metrics">
          <span>
            Mesuré : <strong>{metrics.measuredCps.toFixed(1)}</strong> CPS
          </span>
          <span>Clics : {metrics.clicksEmitted}</span>
          <span>Dérive Σ : {metrics.cumulativeDeadlineErrorMs.toFixed(0)} ms</span>
        </div>
      ) : null}

      <div className="toggles">
        <button type="button" className="ghost" onClick={() => void onToggleAdvanced()}>
          {advanced ? "Mode Simple" : "Mode Advanced"}
        </button>
        <button type="button" className="ghost" onClick={() => void onToggleOverlay()}>
          Overlay {overlayVisible ? "ON" : "OFF"}
        </button>
      </div>

      {advanced ? (
        <div className="advanced">
          <label className="field row">
            <input
              type="checkbox"
              checked={targetFixed}
              disabled={running}
              onChange={(e) => setTargetFixed(e.target.checked)}
            />
            <span>
              Cible fixe {targetFixed ? `(${targetX}, ${targetY})` : ""}
            </span>
          </label>
          <button type="button" disabled={running || picking} onClick={() => void onPick()}>
            {picking ? "Place le curseur… (2s)" : "Pick point"}
          </button>

          <label className="field">
            <span>Jitter CPS (0–0.5)</span>
            <input
              type="number"
              min={0}
              max={0.5}
              step={0.05}
              value={jitter}
              disabled={running}
              onChange={(e) => setJitter(Number(e.target.value))}
            />
          </label>

          <label className="field">
            <span>Clic</span>
            <select
              value={clickKind}
              disabled={running}
              onChange={(e) => setClickKind(e.target.value as ClickKind)}
            >
              <option value="single">Simple</option>
              <option value="double">Double</option>
            </select>
          </label>

          <label className="field">
            <span>Duty cycle (0–1)</span>
            <input
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              value={duty}
              disabled={running}
              onChange={(e) => setDuty(Number(e.target.value))}
            />
          </label>

          <label className="field">
            <span>Max clics</span>
            <input
              type="number"
              min={1}
              placeholder="∞"
              value={maxClicks}
              disabled={running}
              onChange={(e) => setMaxClicks(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Max durée (s)</span>
            <input
              type="number"
              min={1}
              placeholder="∞"
              value={maxDurationSec}
              disabled={running}
              onChange={(e) => setMaxDurationSec(e.target.value)}
            />
          </label>

          <label className="field row">
            <input
              type="checkbox"
              checked={stopTopLeft}
              disabled={running}
              onChange={(e) => setStopTopLeft(e.target.checked)}
            />
            <span>Stop zone : coin haut-gauche</span>
          </label>
        </div>
      ) : null}

      <p className="hint">F6 = action · F8 = arrêt d&apos;urgence (Rust)</p>

      {status.message ? <p className="message">{status.message}</p> : null}

      <div className="actions">
        <button type="button" onClick={() => void onStart()} disabled={running}>
          Start
        </button>
        <button type="button" className="danger" onClick={() => void onStop()}>
          Stop
        </button>
        <button
          type="button"
          className="ghost"
          disabled={running}
          onClick={() => void persistUi()}
        >
          Sauver
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(getCurrentWindow().label);
  }, []);

  if (label === null) {
    return null;
  }
  if (label === "overlay") {
    return <OverlayView />;
  }
  return <MainApp />;
}

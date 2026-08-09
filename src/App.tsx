import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

function App() {
  const [status, setStatus] = useState<EngineStatus>({
    state: "idle",
    cancelled: false,
    message: null,
  });
  const [cps, setCps] = useState(10);
  const [button, setButton] = useState<MouseButton>("left");
  const [mode, setMode] = useState<ClickMode>("toggle");
  const [metrics, setMetrics] = useState<ClickerMetrics | null>(null);

  const refresh = useCallback(async () => {
    const next = await invoke<EngineStatus>("get_engine_state");
    setStatus(next);
    const m = await invoke<ClickerMetrics>("get_clicker_metrics");
    setMetrics(m);
  }, []);

  useEffect(() => {
    void refresh();
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

  async function onStart() {
    const next = await invoke<EngineStatus>("start_clicker", {
      request: { button, cps, mode },
    });
    setStatus(next);
    await refresh();
  }

  async function onStop() {
    const next = await invoke<EngineStatus>("request_cancel");
    setStatus(next);
    await refresh();
  }

  const running = status.state === "running";

  return (
    <main className="container">
      <h1>MacroEngine M1-A</h1>
      <p className="subtitle">Engine proof — SendInput · CPS · hotkeys</p>

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

      <p className="hint">F6 = action · F8 = arrêt d&apos;urgence (Rust, hors React)</p>

      {status.message ? <p className="message">{status.message}</p> : null}

      <div className="actions">
        <button type="button" onClick={() => void onStart()} disabled={running}>
          Start
        </button>
        <button type="button" className="danger" onClick={() => void onStop()}>
          Stop
        </button>
      </div>
    </main>
  );
}

export default App;

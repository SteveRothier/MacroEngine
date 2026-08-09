import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type EngineStatus = {
  state: string;
  cancelled: boolean;
  message?: string | null;
};

function App() {
  const [status, setStatus] = useState<EngineStatus>({
    state: "idle",
    cancelled: false,
    message: null,
  });

  const refresh = useCallback(async () => {
    const next = await invoke<EngineStatus>("get_engine_state");
    setStatus(next);
  }, []);

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    void listen<EngineStatus>("engine://status", () => {
      void refresh();
    }).then((fn) => {
      unlisten = fn;
    });
    void listen<EngineStatus>("engine://log", () => {
      void refresh();
    });
    return () => {
      unlisten?.();
    };
  }, [refresh]);

  async function onStart() {
    const next = await invoke<EngineStatus>("begin_demo_run");
    setStatus(next);
  }

  async function onCancel() {
    const next = await invoke<EngineStatus>("request_cancel");
    setStatus(next);
  }

  return (
    <main className="container">
      <h1>MacroEngine M0</h1>
      <p className="subtitle">Fondations — coquille Tauri + contrats moteur</p>

      <div className={`badge state-${status.state}`}>
        État : <strong>{status.state}</strong>
        {status.cancelled ? " · cancelled" : ""}
      </div>

      {status.message ? <p className="message">{status.message}</p> : null}

      <div className="actions">
        <button type="button" onClick={() => void onStart()}>
          Demo run
        </button>
        <button type="button" className="danger" onClick={() => void onCancel()}>
          Cancel
        </button>
      </div>
    </main>
  );
}

export default App;

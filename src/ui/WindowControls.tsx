import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";

type Props = {
  className?: string;
};

function readTauriWindow(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function WindowControls({ className = "" }: Props) {
  const [win, setWin] = useState<Window | null>(() => readTauriWindow());

  useEffect(() => {
    if (win) return;
    const id = window.setInterval(() => {
      const next = readTauriWindow();
      if (next) {
        setWin(next);
        window.clearInterval(id);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [win]);

  const shellClass = ["window-controls", className].filter(Boolean).join(" ");

  if (!win) {
    return <div className={shellClass} aria-hidden />;
  }

  return (
    <div className={shellClass}>
      <button
        type="button"
        className="win-btn"
        title="Réduire"
        aria-label="Réduire"
        onClick={() => void win.minimize()}
      >
        <Minus size={14} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className="win-btn"
        title="Agrandir"
        aria-label="Agrandir"
        onClick={() => void win.toggleMaximize()}
      >
        <Square size={12} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className="win-btn win-close"
        title="Fermer"
        aria-label="Fermer"
        onClick={() => void win.close()}
      >
        <X size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

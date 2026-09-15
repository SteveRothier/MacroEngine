import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import { applyTheme, readStoredTheme } from "./theme";
/* Legacy tokens/ui.css kept for overlays (App.tsx), shell window controls, and
   residual Clicker/Macro preview classes still shared with the shell. Prefer caster tokens. */
import "./styles/tokens.css";
import "./ui/shell/tokens.css";
import "./ui/ui.css";
import "./ui/shell/shell.css";
import "./library/library.css";

applyTheme(readStoredTheme());

try {
  const label = getCurrentWindow().label;
  if (label === "picker" || label === "overlay" || label === "zones") {
    document.documentElement.dataset.window = label;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }
  if (label === "picker" || label === "zones") {
    void getCurrentWebviewWindow().setBackgroundColor([0, 0, 0, 0]);
  }
} catch {
  /* browser preview */
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

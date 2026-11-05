import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import { applyTheme, readStoredTheme } from "./theme";
import {
  armBootSplashMaxTimeout,
  dismissBootSplash,
  removeBootSplashImmediate,
  startBootSplashEntrance,
} from "./bootSplash";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
/* Legacy tokens/ui.css kept for overlays (App.tsx), shell window controls, and
   residual Clicker/Macro preview classes still shared with the shell. Prefer caster tokens. */
import "./styles/tokens.css";
import "./ui/shell/tokens.css";
import "./ui/ui.css";
import "./ui/shell/shell.css";
import "./library/workspaceLibrary.css";

applyTheme(readStoredTheme());

let windowLabel = "main";
try {
  windowLabel = getCurrentWindow().label;
  if (windowLabel === "picker" || windowLabel === "overlay" || windowLabel === "zones") {
    document.documentElement.dataset.window = windowLabel;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    removeBootSplashImmediate();
  }
  if (windowLabel === "picker" || windowLabel === "zones") {
    void getCurrentWebviewWindow().setBackgroundColor([0, 0, 0, 0]);
  }
} catch {
  /* browser preview */
}

if (windowLabel === "main") {
  startBootSplashEntrance();
  armBootSplashMaxTimeout();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (windowLabel === "main") {
  // Double rAF: after first paint of the Accueil shell, then show the native window.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dismissBootSplash();
      void invoke("show_main_when_frontend_ready").catch(() => {
        void getCurrentWindow().show().catch(() => {});
      });
    });
  });
}

/** Lazy chunk loaders for heavy MainApp views (code-split Accueil vs editors). */

export type EditorKind = "macro" | "clicker" | "script" | "settings";

export function loadMacroEditor() {
  return import("../macros/graph/MacroEditorView");
}

export function loadScriptEditor() {
  return import("../scripts/ScriptEditorView");
}

export function loadClickerStudio() {
  return import("../clicker/ClickerStudio");
}

export function loadSettingsView() {
  return import("../settings/SettingsView");
}

export function prefetchEditor(kind: EditorKind): void {
  switch (kind) {
    case "macro":
      void loadMacroEditor();
      break;
    case "script":
      void loadScriptEditor();
      break;
    case "clicker":
      void loadClickerStudio();
      break;
    case "settings":
      void loadSettingsView();
      break;
  }
}

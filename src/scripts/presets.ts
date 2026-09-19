import type { TFunction } from "../i18n";
import type { ScriptLanguage } from "./types";

/** Catalog of example scripts (UI presets — not auto-seeded to disk). */

export type ScriptPreset = {
  id: string;
  name: string;
  description: string;
  source: string;
  allowNetwork?: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
  allowInput?: boolean;
};

type ScriptPresetDef = {
  id: string;
  catalogKey:
    | "helloParam"
    | "assertReturn"
    | "sleepLog"
    | "httpGet"
    | "clipRoundtrip"
    | "fsNote"
    | "runMacro"
    | "clickSleep";
  allowNetwork?: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
  allowInput?: boolean;
  sources: { javascript: string; typescript: string };
};

const SCRIPT_PRESET_DEFS: ScriptPresetDef[] = [
  {
    id: "hello-param",
    catalogKey: "helloParam",
    sources: {
      javascript: `//@param label string world
caster.log("hello " + caster.get("label"));
caster.return(caster.get("label"));
`,
      typescript: `//@param label string world
const label: string = String(caster.get("label") ?? "");
caster.log("hello " + label);
caster.return(label);
`,

    },
  },
  {
    id: "assert-return",
    catalogKey: "assertReturn",
    sources: {
      javascript: `//@param n number 3
const n = Number(caster.get("n") || 0);
caster.assert(n >= 0, "n doit être >= 0");
caster.set("n", n + 1);
caster.log("n=" + caster.get("n"));
caster.return(caster.get("n"));
`,
      typescript: `//@param n number 3
const n: number = Number(caster.get("n") || 0);
caster.assert(n >= 0, "n doit être >= 0");
caster.set("n", n + 1);
caster.log("n=" + String(caster.get("n")));
caster.return(caster.get("n"));
`,

    },
  },
  {
    id: "sleep-log",
    catalogKey: "sleepLog",
    allowInput: true,
    sources: {
      javascript: `//@param ms number 200
const ms = Number(caster.get("ms") || 200);
caster.log("pause " + ms + "ms");
caster.sleep(ms);
caster.log("ok");
caster.return(ms);
`,
      typescript: `//@param ms number 200
const ms: number = Number(caster.get("ms") || 200);
caster.log("pause " + ms + "ms");
caster.sleep(ms);
caster.log("ok");
caster.return(ms);
`,

    },
  },
  {
    id: "http-get",
    catalogKey: "httpGet",
    allowNetwork: true,
    sources: {
      javascript: `//@param url string https://httpbin.org/get
const res = caster.fetch({
  method: "GET",
  url: caster.get("url"),
  timeoutMs: 10000,
});
caster.set("status", res.status);
caster.set("body", res.body);
caster.log("ok " + res.status);
caster.return(res.status);
`,
      typescript: `//@param url string https://httpbin.org/get
const res = caster.fetch({
  method: "GET",
  url: String(caster.get("url") ?? ""),
  timeoutMs: 10000,
});
caster.set("status", res.status);
caster.set("body", res.body);
caster.log("ok " + String(res.status));
caster.return(res.status);
`,

    },
  },
  {
    id: "clip-roundtrip",
    catalogKey: "clipRoundtrip",
    allowClipboard: true,
    sources: {
      javascript: `const prev = caster.clipboardRead();
caster.log("clip: " + prev);
caster.clipboardWrite((prev || "") + "\\n(caster)");
caster.return(prev);
`,
      typescript: `const prev: string = String(caster.clipboardRead() ?? "");
caster.log("clip: " + prev);
caster.clipboardWrite(prev + "\\n(caster)");
caster.return(prev);
`,

    },
  },
  {
    id: "fs-note",
    catalogKey: "fsNote",
    allowFs: true,
    sources: {
      javascript: `//@param note string Bonjour depuis Caster
const path = "notes.txt";
try {
  const prev = caster.readFile(path);
  caster.log("avant: " + prev);
} catch (e) {
  caster.log("fichier nouveau");
}
caster.writeFile(path, String(caster.get("note")));
caster.log("écrit " + path);
caster.return(caster.get("note"));
`,
      typescript: `//@param note string Bonjour depuis Caster
const path = "notes.txt";
try {
  const prev: string = String(caster.readFile(path) ?? "");
  caster.log("avant: " + prev);
} catch {
  caster.log("fichier nouveau");
}
caster.writeFile(path, String(caster.get("note") ?? ""));
caster.log("écrit " + path);
caster.return(caster.get("note"));
`,

    },
  },
  {
    id: "run-macro",
    catalogKey: "runMacro",
    allowMacroControl: true,
    sources: {
      javascript: `//@param macroId string
const id = String(caster.get("macroId") || "").trim();
if (!id) {
  caster.log("Indiquez macroId (nom de la macro)");
  caster.return(false);
} else {
  caster.runMacro(id);
  caster.log("macro lancée: " + id);
  caster.return(true);
}
`,
      typescript: `//@param macroId string
const id: string = String(caster.get("macroId") || "").trim();
if (!id) {
  caster.log("Indiquez macroId (nom de la macro)");
  caster.return(false);
} else {
  caster.runMacro(id);
  caster.log("macro lancée: " + id);
  caster.return(true);
}
`,

    },
  },
  {
    id: "click-sleep",
    catalogKey: "clickSleep",
    allowInput: true,
    sources: {
      javascript: `//@param x number 100
//@param y number 100
//@param pauseMs number 200
caster.click({ button: "left", x: caster.get("x"), y: caster.get("y") });
caster.sleep(Number(caster.get("pauseMs") || 200));
caster.log("click ok");
`,
      typescript: `//@param x number 100
//@param y number 100
//@param pauseMs number 200
caster.click({
  button: "left",
  x: Number(caster.get("x") || 100),
  y: Number(caster.get("y") || 100),
});
caster.sleep(Number(caster.get("pauseMs") || 200));
caster.log("click ok");
`,

    },
  },
];

export function getScriptPresets(
  t: TFunction,
  language: ScriptLanguage = "javascript",
): ScriptPreset[] {
  const lang: ScriptLanguage = language === "typescript" ? "typescript" : "javascript";
  return SCRIPT_PRESET_DEFS.map((def) => ({
    id: def.id,
    name: t(`scripts.presets.${def.catalogKey}.name`),
    description: t(`scripts.presets.${def.catalogKey}.description`),
    source: def.sources[lang] ?? def.sources.javascript,
    allowNetwork: def.allowNetwork,
    allowClipboard: def.allowClipboard,
    allowFs: def.allowFs,
    allowMacroControl: def.allowMacroControl,
    allowInput: def.allowInput,
  }));
}

export function findScriptPreset(
  id: string,
  t: TFunction,
  language: ScriptLanguage = "javascript",
): ScriptPreset | undefined {
  return getScriptPresets(t, language).find((p) => p.id === id);
}

/** Permissions partial from a preset (only defined flags). */
export function presetPermissionPatch(preset: ScriptPreset): {
  allowNetwork?: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
  allowInput?: boolean;
} {
  return {
    allowNetwork: preset.allowNetwork ?? false,
    allowClipboard: preset.allowClipboard ?? false,
    allowFs: preset.allowFs ?? false,
    allowMacroControl: preset.allowMacroControl ?? false,
    allowInput: preset.allowInput ?? false,
  };
}

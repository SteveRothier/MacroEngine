import type { TFunction } from "../i18n";

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

type ScriptPresetDef = Omit<ScriptPreset, "name" | "description"> & {
  catalogKey:
    | "helloParam"
    | "httpGet"
    | "clipRoundtrip"
    | "fsNote"
    | "runMacro";
};

const SCRIPT_PRESET_DEFS: ScriptPresetDef[] = [
  {
    id: "hello-param",
    catalogKey: "helloParam",
    source: `//@param label string world
caster.log("hello " + caster.get("label"));
caster.return(caster.get("label"));
`,
  },
  {
    id: "http-get",
    catalogKey: "httpGet",
    allowNetwork: true,
    source: `//@param url string https://httpbin.org/get
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
  },
  {
    id: "clip-roundtrip",
    catalogKey: "clipRoundtrip",
    allowClipboard: true,
    source: `const prev = caster.clipboardRead();
caster.log("clip: " + prev);
caster.clipboardWrite((prev || "") + "\\n(caster)");
caster.return(prev);
`,
  },
  {
    id: "fs-note",
    catalogKey: "fsNote",
    allowFs: true,
    source: `//@param note string Bonjour depuis Caster
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
  },
  {
    id: "run-macro",
    catalogKey: "runMacro",
    allowMacroControl: true,
    source: `//@param macroId string
const id = String(caster.get("macroId") || "").trim();
if (!id) {
  caster.log("Indiquez macroId (nom de la macro)");
  caster.return(false);
} else {
  // Remplacez par le nom exact d'une macro de votre bibliothèque
  caster.runMacro(id);
  caster.log("macro lancée: " + id);
  caster.return(true);
}
`,
  },
];

export function getScriptPresets(t: TFunction): ScriptPreset[] {
  return SCRIPT_PRESET_DEFS.map((def) => ({
    id: def.id,
    name: t(`scripts.presets.${def.catalogKey}.name`),
    description: t(`scripts.presets.${def.catalogKey}.description`),
    source: def.source,
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
): ScriptPreset | undefined {
  return getScriptPresets(t).find((p) => p.id === id);
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

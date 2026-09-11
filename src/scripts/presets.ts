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
};

export const SCRIPT_PRESETS: ScriptPreset[] = [
  {
    id: "hello-param",
    name: "Hello + @param",
    description: "Découverte des paramètres et de caster.return",
    source: `//@param label string world
caster.log("hello " + caster.get("label"));
caster.return(caster.get("label"));
`,
  },
  {
    id: "http-get",
    name: "HTTP GET JSON",
    description: "caster.fetch → variables status / body",
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
    name: "Presse-papiers",
    description: "Lire puis réécrire le presse-papiers",
    allowClipboard: true,
    source: `const prev = caster.clipboardRead();
caster.log("clip: " + prev);
caster.clipboardWrite((prev || "") + "\\n(caster)");
caster.return(prev);
`,
  },
  {
    id: "fs-note",
    name: "Note sandbox",
    description: "Lire/écrire notes.txt sous script-data/",
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
    name: "Lancer une macro",
    description: "caster.runMacro (profondeur max 3)",
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

export function findScriptPreset(id: string): ScriptPreset | undefined {
  return SCRIPT_PRESETS.find((p) => p.id === id);
}

/** Permissions partial from a preset (only defined flags). */
export function presetPermissionPatch(preset: ScriptPreset): {
  allowNetwork?: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
} {
  return {
    allowNetwork: preset.allowNetwork ?? false,
    allowClipboard: preset.allowClipboard ?? false,
    allowFs: preset.allowFs ?? false,
    allowMacroControl: preset.allowMacroControl ?? false,
  };
}

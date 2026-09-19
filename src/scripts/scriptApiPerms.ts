import type { ScriptDoc } from "./types";

/** Maps caster.* APIs to the permission flag they require (if any). */
export type ScriptPermKey =
  | "allowNetwork"
  | "allowClipboard"
  | "allowFs"
  | "allowMacroControl"
  | "allowInput"
  | "allowProcess";

const API_PERM: Record<string, ScriptPermKey | undefined> = {
  get: undefined,
  set: undefined,
  log: undefined,
  return: undefined,
  sleep: "allowInput",
  fetch: "allowNetwork",
  include: undefined,
  runScript: undefined,
  click: "allowInput",
  moveTo: "allowInput",
  keyTap: "allowInput",
  keyDown: "allowInput",
  keyUp: "allowInput",
  wheel: "allowInput",
  clipboardRead: "allowClipboard",
  clipboardWrite: "allowClipboard",
  readFile: "allowFs",
  writeFile: "allowFs",
  runMacro: "allowMacroControl",
  runProcess: "allowProcess",
  assert: undefined,
};

export function permissionForApi(apiName: string): ScriptPermKey | undefined {
  const key = apiName.replace(/^caster\./, "");
  return API_PERM[key];
}

export function permPatchForApi(
  apiName: string,
): Partial<ScriptDoc> | undefined {
  const perm = permissionForApi(apiName);
  if (!perm) return undefined;
  return { [perm]: true };
}

/** Detect permission-related engine errors → which flag to mention. */
export function permissionFromErrorMessage(
  raw: string,
): ScriptPermKey | undefined {
  const s = raw.toLowerCase();
  if (/fetch|network|allownetwork|réseau/.test(s)) return "allowNetwork";
  if (/clipboard/.test(s)) return "allowClipboard";
  if (/readfile|writefile|allowfs/.test(s)) return "allowFs";
  if (/runmacro|allowmacro|macro control/.test(s)) return "allowMacroControl";
  if (/runprocess|allowprocess|process permission/.test(s)) {
    return "allowProcess";
  }
  if (
    /disabled/.test(s) &&
    /click|moveto|keytap|keydown|keyup|wheel|sleep/.test(s)
  ) {
    return "allowInput";
  }
  if (/\bdisabled\b/.test(s)) return "allowInput";
  return undefined;
}

export function permLabelKey(
  perm: ScriptPermKey,
):
  | "scripts.permissions.network"
  | "scripts.permissions.clipboard"
  | "scripts.permissions.fs"
  | "scripts.permissions.macros"
  | "scripts.permissions.input"
  | "scripts.permissions.process" {
  switch (perm) {
    case "allowNetwork":
      return "scripts.permissions.network";
    case "allowClipboard":
      return "scripts.permissions.clipboard";
    case "allowFs":
      return "scripts.permissions.fs";
    case "allowMacroControl":
      return "scripts.permissions.macros";
    case "allowProcess":
      return "scripts.permissions.process";
    default:
      return "scripts.permissions.input";
  }
}

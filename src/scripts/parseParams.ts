import type { MacroValue } from "../macros/types";

export type ScriptParamDef = {
  name: string;
  type: "number" | "string" | "boolean";
  default?: MacroValue;
};

/** Parse `//@param` / `#@param name type [default]` lines (same convention as Rust). */
export function parseParamDefs(source: string): ScriptParamDef[] {
  const out: ScriptParamDef[] = [];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    let rest: string | null = null;
    if (trimmed.startsWith("//@param")) {
      rest = trimmed.slice("//@param".length).trim();
    } else if (trimmed.startsWith("// @param")) {
      rest = trimmed.slice("// @param".length).trim();
    } else if (trimmed.startsWith("#@param")) {
      rest = trimmed.slice("#@param".length).trim();
    } else if (trimmed.startsWith("# @param")) {
      rest = trimmed.slice("# @param".length).trim();
    }
    if (rest == null || rest === "") continue;
    const m = rest.match(/^(\S+)\s+(number|string|boolean)(?:\s+(.+))?$/i);
    if (!m) continue;
    const name = m[1];
    const ty = m[2].toLowerCase() as ScriptParamDef["type"];
    const raw = m[3]?.trim();
    const def: ScriptParamDef = { name, type: ty };
    if (raw != null && raw !== "") {
      if (ty === "boolean") {
        def.default = raw.toLowerCase() === "true" || raw === "1";
      } else if (ty === "number") {
        const n = Number(raw);
        def.default = Number.isFinite(n) ? n : 0;
      } else {
        def.default = raw;
      }
    }
    out.push(def);
  }
  return out;
}

export function paramValueAsString(
  v: MacroValue | undefined,
  fallback?: MacroValue,
): string {
  const x = v ?? fallback;
  if (x === undefined) return "";
  if (typeof x === "boolean") return x ? "true" : "false";
  return String(x);
}

export function parseParamInput(
  ty: ScriptParamDef["type"],
  raw: string,
): MacroValue {
  if (ty === "boolean") {
    return raw.toLowerCase() === "true" || raw === "1";
  }
  if (ty === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw;
}

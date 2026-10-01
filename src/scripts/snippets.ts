/** Shared snippets for Script editor (JS/TS). */

export type SnippetLocale = "fr" | "en";

function isFr(locale: string | undefined): boolean {
  return !locale || locale.toLowerCase().startsWith("fr");
}

export function scriptSnippetGet(locale?: string): string {
  const c = isFr(locale)
    ? "// GET JSON → variable"
    : "// GET JSON → variable";
  return `${c}
const res = caster.fetch({ method: "GET", url: "https://httpbin.org/get" });
caster.set("status", res.status);
caster.set("body", res.body);
caster.log("ok " + res.status);
`;
}

export function scriptSnippetSet(locale?: string): string {
  const c = isFr(locale)
    ? "// Lire / écrire une variable + retour"
    : "// Read / write a variable + return";
  return `//@param n number 0
${c}
const cur = caster.get("n") ?? 0;
caster.set("n", cur + 1);
caster.log("n=" + caster.get("n"));
caster.return(caster.get("n"));
`;
}

export function scriptSnippetParam(_locale?: string): string {
  return `//@param label string world
caster.log("hello " + caster.get("label"));
caster.return(caster.get("label"));
`;
}

export function scriptSnippetClick(locale?: string): string {
  const c = isFr(locale)
    ? "// Click + pause (nécessite permission Souris / clavier)"
    : "// Click + pause (requires Mouse / keyboard permission)";
  return `${c}
caster.click({ button: "left", x: 100, y: 100 });
caster.sleep(200);
`;
}

export function scriptSnippetKey(locale?: string): string {
  const c = isFr(locale)
    ? "// Touche (nécessite permission Souris / clavier)"
    : "// Key tap (requires Mouse / keyboard permission)";
  return `${c}
caster.keyTap("A", { ctrl: false, alt: false, shift: false });
`;
}

export function scriptSnippetInclude(locale?: string): string {
  const c = isFr(locale)
    ? '// Module bibliothèque (caster.include)'
    : "// Library module (caster.include)";
  const mod = isFr(locale) ? "mon-module" : "my-module";
  return `${c}
const utils = caster.include("${mod}");
caster.log(utils);
`;
}

export function scriptSnippetRunProcess(locale?: string): string {
  const c = isFr(locale)
    ? "// Processus externe (nécessite permission Processus)"
    : "// External process (requires Process permission)";
  return `${c}
const r = caster.runProcess({
  command: "cmd",
  args: ["/c", "echo", "hello"],
  wait: true,
  timeoutMs: 5000,
});
caster.log("exit=" + r.exitCode);
caster.log(r.stdout);
`;
}

/** @deprecated use scriptSnippet* helpers — kept for import compatibility */
export const SCRIPT_SNIPPET_GET = scriptSnippetGet("fr");
export const SCRIPT_SNIPPET_SET = scriptSnippetSet("fr");
export const SCRIPT_SNIPPET_PARAM = scriptSnippetParam("fr");
export const SCRIPT_SNIPPET_CLICK = scriptSnippetClick("fr");
export const SCRIPT_SNIPPET_KEY = scriptSnippetKey("fr");
export const SCRIPT_SNIPPET_INCLUDE = scriptSnippetInclude("fr");
export const SCRIPT_SNIPPET_RUN_PROCESS = scriptSnippetRunProcess("fr");

/** Mini insert examples for the API help menu (1–3 lines). */
export type ApiInsertName =
  | "get"
  | "set"
  | "log"
  | "return"
  | "sleep"
  | "fetch"
  | "include"
  | "runScript"
  | "click"
  | "keyTap"
  | "moveTo"
  | "runProcess"
  | "clipboardRead"
  | "clipboardWrite";

const API_INSERT_JS: Record<ApiInsertName, string> = {
  get: `const v = caster.get("label");\n`,
  set: `caster.set("n", 1);\n`,
  log: `caster.log("hello");\n`,
  return: `caster.return(caster.get("label"));\n`,
  sleep: `caster.sleep(200);\n`,
  fetch: `const res = caster.fetch({ method: "GET", url: "https://httpbin.org/get" });\ncaster.log(String(res.status));\n`,
  include: `const mod = caster.include("mon-module");\ncaster.log(mod);\n`,
  runScript: `caster.runScript("autre-script", { n: 1 });\n`,
  click: `caster.click({ button: "left", x: 100, y: 100 });\n`,
  keyTap: `caster.keyTap("A", { ctrl: false, alt: false, shift: false });\n`,
  moveTo: `caster.moveTo(100, 100);\n`,
  runProcess: `const r = caster.runProcess({ command: "cmd", args: ["/c", "echo", "hi"], wait: true });\ncaster.log(r.stdout);\n`,
  clipboardRead: `const text = caster.clipboardRead();\ncaster.log(text);\n`,
  clipboardWrite: `caster.clipboardWrite("hello");\n`,
};

export function apiInsertSnippet(name: ApiInsertName): string {
  return API_INSERT_JS[name];
}

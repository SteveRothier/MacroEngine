/** Shared snippets for Script editor (JS/TS). */

export const SCRIPT_SNIPPET_GET = `// GET JSON → variable
const res = caster.fetch({ method: "GET", url: "https://httpbin.org/get" });
caster.set("status", res.status);
caster.set("body", res.body);
caster.log("ok " + res.status);
`;

export const SCRIPT_SNIPPET_SET = `//@param n number 0
// Lire / écrire une variable + retour
const cur = caster.get("n") ?? 0;
caster.set("n", cur + 1);
caster.log("n=" + caster.get("n"));
caster.return(caster.get("n"));
`;

export const SCRIPT_SNIPPET_PARAM = `//@param label string world
caster.log("hello " + caster.get("label"));
caster.return(caster.get("label"));
`;

export const SCRIPT_SNIPPET_CLICK = `// Click + pause (nécessite permission Souris / clavier)
caster.click({ button: "left", x: 100, y: 100 });
caster.sleep(200);
`;

export const SCRIPT_SNIPPET_KEY = `// Touche (nécessite permission Souris / clavier)
caster.keyTap("A", { ctrl: false, alt: false, shift: false });
`;

export const SCRIPT_SNIPPET_INCLUDE = `// Module bibliothèque (caster.include)
const utils = caster.include("mon-module");
caster.log(utils);
`;

export const SCRIPT_SNIPPET_RUN_PROCESS = `// Processus externe (nécessite permission Processus)
const r = caster.runProcess({
  command: "cmd",
  args: ["/c", "echo", "hello"],
  wait: true,
  timeoutMs: 5000,
});
caster.log("exit=" + r.exitCode);
caster.log(r.stdout);
`;

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
  | "click";

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
};

export function apiInsertSnippet(name: ApiInsertName): string {
  return API_INSERT_JS[name];
}

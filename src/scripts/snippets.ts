/** Shared JS snippets for script.run / Script editor. */

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

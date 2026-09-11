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

import type { ScriptLanguage } from "./types";

/** Default starter sources — keep in sync with creation + language-switch swap. */

export function defaultRunnableSource(language: ScriptLanguage): string {
  switch (language) {
    case "typescript":
      return `//@param label string world
const label: string = String(caster.get("label") ?? "");
caster.log("hello " + label);
caster.return(label);
`;
    default:
      return `//@param label string world
caster.log("hello " + caster.get("label"));
caster.return(caster.get("label"));
`;
  }
}

export function defaultModuleSource(language: ScriptLanguage): string {
  switch (language) {
    case "typescript":
      return `// Module bibliothèque — caster.include
module.exports = {
  hello: (): string => {
    caster.log("hi");
    return "hi";
  },
};
`;
    default:
      return `// Module bibliothèque — caster.include
module.exports = {
  hello: () => {
    caster.log("hi");
    return "hi";
  },
};
`;
  }
}

export function defaultScriptSource(
  language: ScriptLanguage,
  isModule: boolean,
): string {
  return isModule
    ? defaultModuleSource(language)
    : defaultRunnableSource(language);
}

/** True when source matches a known default template (any language / module flag). */
export function isDefaultScriptSource(source: string): boolean {
  const normalized = source.replace(/\r\n/g, "\n");
  const languages: ScriptLanguage[] = ["javascript", "typescript"];
  for (const lang of languages) {
    if (normalized === defaultRunnableSource(lang)) return true;
    if (normalized === defaultModuleSource(lang)) return true;
  }
  if (
    normalized ===
      "//@param label string world\ncaster.log('hello ' + caster.get('label'));\n" ||
    normalized ===
      "// Module bibliothèque — caster.include\nmodule.exports = {\n  hello: () => caster.log('hi'),\n};\n"
  ) {
    return true;
  }
  return false;
}

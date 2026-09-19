/** Script language (JavaScript or TypeScript). */
export type ScriptLanguage = "javascript" | "typescript";

export type ScriptDoc = {
  id: string;
  name: string;
  source: string;
  language?: ScriptLanguage;
  isModule?: boolean;
  allowNetwork: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
  allowInput?: boolean;
  allowProcess?: boolean;
  paramValues?: Record<string, boolean | number | string>;
};

/** Accueil / list metadata without source. */
export type ScriptSummary = {
  id: string;
  name: string;
  language?: ScriptLanguage;
  isModule?: boolean;
  allowNetwork: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
  allowInput?: boolean;
  allowProcess?: boolean;
};

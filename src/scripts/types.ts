export type ScriptLanguage = "javascript" | "typescript" | "python";

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

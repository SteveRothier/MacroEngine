export type ScriptDoc = {
  id: string;
  name: string;
  source: string;
  allowNetwork: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
  allowInput?: boolean;
  paramValues?: Record<string, boolean | number | string>;
};

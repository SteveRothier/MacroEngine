export type ScriptDoc = {
  id: string;
  name: string;
  source: string;
  allowNetwork: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
  paramValues?: Record<string, boolean | number | string>;
};

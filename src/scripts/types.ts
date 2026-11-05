import type { MacroTrigger } from "../macros/types";
import type { ProcessFilter, ProcessFilterScopeMode } from "../process";

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
  processFilter?: ProcessFilterScopeMode;
  localProcessFilter?: ProcessFilter;
  /** Per-script launch trigger (same union as macros). */
  trigger?: MacroTrigger;
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
  triggerType?: string;
  triggerKey?: string | null;
  scheduleHour?: number | null;
  scheduleMinute?: number | null;
  foregroundExe?: string | null;
  windowTitle?: string | null;
};

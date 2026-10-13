import type {
  CompareOp,
  Condition,
  ConditionParams,
  MacroValue,
  Operand,
} from "./types";

export const COMPARE_OP_OPTS: { value: CompareOp; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "ne", label: "≠" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "contains", label: "∋" },
  { value: "startsWith", label: "a…" },
  { value: "endsWith", label: "…z" },
  { value: "empty", label: "∅" },
];

export const COMPARE_OP_SYMBOLS: Record<CompareOp, string> = {
  eq: "=",
  ne: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  contains: "∋",
  startsWith: "a…",
  endsWith: "…z",
  empty: "∅",
};

export function isVarOperand(o: Operand): o is { var: string } {
  return typeof o === "object" && o !== null && "var" in o;
}

export function operandMode(o: Operand): "var" | "lit" {
  return isVarOperand(o) ? "var" : "lit";
}

export function litString(o: Operand): string {
  if (isVarOperand(o)) return "";
  if (typeof o === "string") return o;
  return String(o);
}

export function parseLit(raw: string): MacroValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (raw.trim() !== "" && !Number.isNaN(n)) return n;
  return raw;
}

/** Switch var↔lit while preserving the typed text when possible. */
export function switchOperandMode(o: Operand, mode: "var" | "lit"): Operand {
  if (mode === "var") {
    if (isVarOperand(o)) return o;
    const s = litString(o).trim();
    return { var: s || "n" };
  }
  if (!isVarOperand(o)) return o;
  return parseLit(o.var);
}

export function setOperandValue(o: Operand, raw: string): Operand {
  return operandMode(o) === "var" ? { var: raw } : parseLit(raw);
}

export function operandDisplay(o: Operand): string {
  return isVarOperand(o) ? o.var : litString(o);
}

/** UI family for Si / Tant que conditions. */
export type ConditionFamily =
  | "compare"
  | "process"
  | "window"
  | "pixel"
  | "mouse"
  | "key"
  | "time"
  | "clipboard"
  | "variable";

/** @deprecated use ConditionFamily — kept as alias for older call sites */
export type ConditionMode = ConditionFamily;

export const CONDITION_FAMILY_OPTS: {
  value: ConditionFamily;
  labelKey: string;
}[] = [
  { value: "compare", labelKey: "macros.params.conditionCompare" },
  { value: "process", labelKey: "macros.params.conditionProcess" },
  { value: "window", labelKey: "macros.params.conditionWindow" },
  { value: "pixel", labelKey: "macros.params.conditionPixel" },
  { value: "mouse", labelKey: "macros.params.conditionMouse" },
  { value: "key", labelKey: "macros.params.conditionKey" },
  { value: "time", labelKey: "macros.params.conditionTime" },
  { value: "clipboard", labelKey: "macros.params.conditionClipboard" },
  { value: "variable", labelKey: "macros.params.conditionVariable" },
];

export const PROCESS_PREDICATE_OPTS = [
  { value: "process.eq", labelKey: "macros.params.processPredEq" as const },
  {
    value: "process.contains",
    labelKey: "macros.params.processPredContains" as const,
  },
  {
    value: "process.running",
    labelKey: "macros.params.processPredRunning" as const,
  },
] as const;

export type ProcessPredicate = (typeof PROCESS_PREDICATE_OPTS)[number]["value"];

export const WINDOW_PREDICATE_OPTS = [
  {
    value: "window.title.eq",
    labelKey: "macros.params.windowTitleEq" as const,
  },
  {
    value: "window.title.contains",
    labelKey: "macros.params.windowTitleContains" as const,
  },
] as const;

export type WindowPredicate = (typeof WINDOW_PREDICATE_OPTS)[number]["value"];

export const MOUSE_PREDICATE_OPTS = [
  {
    value: "mouse.inRect",
    labelKey: "macros.params.mousePredInRect" as const,
  },
  {
    value: "mouse.button.down",
    labelKey: "macros.params.mousePredButton" as const,
  },
] as const;

export type MousePredicate = (typeof MOUSE_PREDICATE_OPTS)[number]["value"];

export const CLIPBOARD_PREDICATE_OPTS = [
  {
    value: "clipboard.eq",
    labelKey: "macros.params.clipboardPredEq" as const,
  },
  {
    value: "clipboard.contains",
    labelKey: "macros.params.clipboardPredContains" as const,
  },
  {
    value: "clipboard.empty",
    labelKey: "macros.params.clipboardPredEmpty" as const,
  },
] as const;

export type ClipboardPredicate =
  (typeof CLIPBOARD_PREDICATE_OPTS)[number]["value"];

export const MOUSE_BUTTON_OPTS = [
  { value: "left", labelKey: "macros.action.button.left" as const },
  { value: "right", labelKey: "macros.action.button.right" as const },
  { value: "middle", labelKey: "macros.action.button.middle" as const },
] as const;

export const TIME_UNIT_OPTS = [
  { value: "hour", labelKey: "macros.params.timeUnitHour" as const },
  { value: "minute", labelKey: "macros.params.timeUnitMinute" as const },
  { value: "weekday", labelKey: "macros.params.timeUnitWeekday" as const },
  { value: "day", labelKey: "macros.params.timeUnitDay" as const },
  { value: "month", labelKey: "macros.params.timeUnitMonth" as const },
  { value: "year", labelKey: "macros.params.timeUnitYear" as const },
] as const;

export const TIME_COMPARE_OP_OPTS: { value: CompareOp; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "ne", label: "≠" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
];

export function isProcessPredicate(
  p: string | undefined,
): p is ProcessPredicate {
  return (
    p === "process.eq" || p === "process.contains" || p === "process.running"
  );
}

export function isWindowPredicate(p: string | undefined): p is WindowPredicate {
  return p === "window.title.eq" || p === "window.title.contains";
}

export function isMousePredicate(p: string | undefined): p is MousePredicate {
  return p === "mouse.inRect" || p === "mouse.button.down";
}

export function isClipboardPredicate(
  p: string | undefined,
): p is ClipboardPredicate {
  return (
    p === "clipboard.eq" ||
    p === "clipboard.contains" ||
    p === "clipboard.empty"
  );
}

export function conditionFamily(condition: Condition): ConditionFamily {
  const p = condition.predicate;
  if (!p) return "compare";
  if (p.startsWith("process.")) return "process";
  if (p.startsWith("window.")) return "window";
  if (p === "pixel.color") return "pixel";
  if (p.startsWith("mouse.")) return "mouse";
  if (p === "key.down") return "key";
  if (p === "time.compare") return "time";
  if (p.startsWith("clipboard.")) return "clipboard";
  if (p === "var.defined") return "variable";
  return "process";
}

/** Alias used by older UI code. */
export function conditionMode(condition: Condition): ConditionFamily {
  return conditionFamily(condition);
}

function keepCompareBase(condition: Condition): Pick<
  Condition,
  "left" | "op" | "right"
> {
  return {
    left: condition.left,
    op: condition.op,
    right: condition.right,
  };
}

/** Switch family while preserving compare operands when possible. */
export function setConditionFamily(
  condition: Condition,
  family: ConditionFamily,
): Condition {
  const base = keepCompareBase(condition);
  switch (family) {
    case "compare":
      return { ...base };
    case "process":
      return {
        ...base,
        predicate: isProcessPredicate(condition.predicate)
          ? condition.predicate
          : "process.eq",
        value: condition.value ?? "",
        params: undefined,
      };
    case "window":
      return {
        ...base,
        predicate: isWindowPredicate(condition.predicate)
          ? condition.predicate
          : "window.title.contains",
        value: condition.value ?? "",
        params: condition.params?.exe
          ? { exe: condition.params.exe }
          : undefined,
      };
    case "pixel":
      return {
        ...base,
        predicate: "pixel.color",
        value: undefined,
        params: {
          x: condition.params?.x ?? 0,
          y: condition.params?.y ?? 0,
          color: condition.params?.color ?? "#ffffff",
          tolerance: condition.params?.tolerance ?? 10,
        },
      };
    case "mouse":
      if (condition.predicate === "mouse.button.down") {
        return {
          ...base,
          predicate: "mouse.button.down",
          value: undefined,
          params: {
            button: condition.params?.button ?? "left",
          },
        };
      }
      return {
        ...base,
        predicate: "mouse.inRect",
        value: undefined,
        params: {
          x1: condition.params?.x1 ?? 0,
          y1: condition.params?.y1 ?? 0,
          x2: condition.params?.x2 ?? 100,
          y2: condition.params?.y2 ?? 100,
        },
      };
    case "key":
      return {
        ...base,
        predicate: "key.down",
        value: undefined,
        params: {
          key: condition.params?.key ?? "F1",
          mods: condition.params?.mods ?? {
            ctrl: false,
            alt: false,
            shift: false,
          },
        },
      };
    case "time":
      return {
        ...base,
        predicate: "time.compare",
        value: undefined,
        params: {
          unit: condition.params?.unit ?? "hour",
          op: condition.params?.op ?? "gte",
          value:
            typeof condition.params?.value === "number"
              ? condition.params.value
              : 12,
        },
      };
    case "clipboard":
      return {
        ...base,
        predicate: isClipboardPredicate(condition.predicate)
          ? condition.predicate
          : "clipboard.contains",
        value: condition.value ?? "",
        params: undefined,
      };
    case "variable":
      return {
        ...base,
        predicate: "var.defined",
        value: condition.value ?? condition.params?.name ?? "n",
        params: undefined,
      };
  }
}

/** @deprecated use setConditionFamily */
export function setConditionMode(
  condition: Condition,
  mode: ConditionFamily,
): Condition {
  return setConditionFamily(condition, mode);
}

export function patchConditionParams(
  condition: Condition,
  patch: Partial<ConditionParams>,
): Condition {
  return {
    ...condition,
    params: { ...(condition.params ?? {}), ...patch },
  };
}

/** Switch mouse sub-predicate while keeping family. */
export function setMousePredicate(
  condition: Condition,
  predicate: MousePredicate,
): Condition {
  const base = keepCompareBase(condition);
  if (predicate === "mouse.button.down") {
    return {
      ...base,
      predicate,
      value: undefined,
      params: { button: condition.params?.button ?? "left" },
    };
  }
  return {
    ...base,
    predicate: "mouse.inRect",
    value: undefined,
    params: {
      x1: condition.params?.x1 ?? 0,
      y1: condition.params?.y1 ?? 0,
      x2: condition.params?.x2 ?? 100,
      y2: condition.params?.y2 ?? 100,
    },
  };
}

export function formatCond(condition: Condition): string {
  if (condition.predicate) {
    const needle = (condition.value ?? "").trim() || "…";
    const p = condition.predicate;
    if (p === "process.contains") return `process ∋ ${needle}`;
    if (p === "process.eq") return `process = ${needle}`;
    if (p === "process.running") return `running ${needle}`;
    if (p === "window.title.eq") return `title = ${needle}`;
    if (p === "window.title.contains") return `title ∋ ${needle}`;
    if (p === "pixel.color") {
      const x = condition.params?.x ?? "?";
      const y = condition.params?.y ?? "?";
      const c = condition.params?.color ?? "…";
      return `pixel(${x},${y}) ≈ ${c}`;
    }
    if (p === "mouse.inRect") {
      const { x1, y1, x2, y2 } = condition.params ?? {};
      return `mouse ∈ (${x1 ?? "?"},${y1 ?? "?"})–(${x2 ?? "?"},${y2 ?? "?"})`;
    }
    if (p === "mouse.button.down") {
      return `mouse ${condition.params?.button ?? "left"} down`;
    }
    if (p === "key.down") {
      const key = condition.params?.key ?? "…";
      const mods = condition.params?.mods;
      const parts: string[] = [];
      if (mods?.ctrl) parts.push("Ctrl");
      if (mods?.alt) parts.push("Alt");
      if (mods?.shift) parts.push("Shift");
      parts.push(key);
      return `key ${parts.join("+")}`;
    }
    if (p === "time.compare") {
      const unit = condition.params?.unit ?? "hour";
      const op = condition.params?.op ?? "eq";
      const sym = COMPARE_OP_SYMBOLS[op] ?? op;
      return `${unit} ${sym} ${condition.params?.value ?? "…"}`;
    }
    if (p === "clipboard.eq") return `clip = ${needle}`;
    if (p === "clipboard.contains") return `clip ∋ ${needle}`;
    if (p === "clipboard.empty") return "clip ∅";
    if (p === "var.defined") return `var ${needle}?`;
    return `${p} ${needle}`;
  }
  const { left, op, right } = condition;
  const L = isVarOperand(left) ? `$${left.var}` : JSON.stringify(left);
  const sym = COMPARE_OP_SYMBOLS[op] ?? op;
  if (op === "empty") return `${L} ${sym}`;
  const R = isVarOperand(right) ? `$${right.var}` : JSON.stringify(right);
  return `${L} ${sym} ${R}`;
}

import type { TFunction } from "../i18n";
import { formatCond } from "./conditionOps";
import { formatKeyChord, type MacroAction } from "./types";

const TITLE_KEYS: Record<MacroAction["type"], string> = {
  "mouse.click": "macros.action.title.mouseClick",
  "mouse.move": "macros.action.title.mouseMove",
  "mouse.down": "macros.action.title.mouseDown",
  "mouse.up": "macros.action.title.mouseUp",
  "mouse.wheel": "macros.action.title.mouseWheel",
  delay: "macros.action.title.delay",
  "process.run": "macros.action.title.processRun",
  "http.request": "macros.action.title.httpRequest",
  "json.path": "macros.action.title.jsonPath",
  "script.run": "macros.action.title.scriptRun",
  "macro.run": "macros.action.title.macroRun",
  "clicker.start": "macros.action.title.clickerStart",
  "key.tap": "macros.action.title.keyTap",
  "key.down": "macros.action.title.keyDown",
  "key.up": "macros.action.title.keyUp",
  "clipboard.set": "macros.action.title.clipboardSet",
  "clipboard.get": "macros.action.title.clipboardGet",
  "var.set": "macros.action.title.varSet",
  "control.if": "macros.action.title.controlIf",
  "control.while": "macros.action.title.controlWhile",
};

export function actionTitle(type: MacroAction["type"], t: TFunction): string {
  return t(TITLE_KEYS[type]);
}

export function mouseButtonLabel(
  button: string | null | undefined,
  t: TFunction,
): string {
  switch (button) {
    case "right":
      return t("macros.action.button.right");
    case "middle":
      return t("macros.action.button.middle");
    default:
      return t("macros.action.button.left");
  }
}

function xySuffix(x?: number | null, y?: number | null): string {
  if (x != null && y != null) return ` @ ${x}, ${y}`;
  return "";
}

export function actionDetail(action: MacroAction, t: TFunction): string {
  switch (action.type) {
    case "mouse.click":
    case "mouse.down":
    case "mouse.up":
      return `${mouseButtonLabel(action.button, t)}${xySuffix(action.x, action.y)}`;
    case "mouse.move":
      return `${action.x}, ${action.y}`;
    case "mouse.wheel":
      return `${action.delta}${xySuffix(action.x, action.y)}`;
    case "delay":
      return `${action.ms} ms`;
    case "process.run":
      return action.command.trim()
        ? action.command
        : t("macros.action.detail.empty");
    case "macro.run":
      return action.macroId.trim()
        ? action.macroId
        : t("macros.action.detail.empty");
    case "clicker.start":
      return action.presetId.trim()
        ? action.presetId
        : t("macros.action.detail.empty");
    case "http.request":
      return action.url.trim()
        ? `${(action.method ?? "GET").toUpperCase()} ${action.url}`
        : t("macros.action.detail.empty");
    case "json.path":
      return action.path.trim()
        ? `${action.sourceVar} → ${action.path}`
        : t("macros.action.detail.empty");
    case "script.run":
      return action.scriptId?.trim()
        ? action.scriptId
        : action.source?.trim()
          ? t("macros.action.detail.inline")
          : t("macros.action.detail.empty");
    case "key.tap":
    case "key.down":
    case "key.up":
      return formatKeyChord(action.key, action.mods);
    case "clipboard.set": {
      const text = action.text.trim();
      return text ? text.slice(0, 32) : t("macros.action.detail.empty");
    }
    case "clipboard.get":
      return action.name
        ? `→ ${action.name}`
        : t("macros.action.detail.empty");
    case "var.set":
      return `${action.name} = ${JSON.stringify(action.value)}`;
    case "control.if":
    case "control.while":
      return formatCond(action.condition);
  }
}

export function isComplexAction(type: MacroAction["type"]): boolean {
  return (
    type === "http.request" ||
    type === "json.path" ||
    type === "script.run" ||
    type === "macro.run" ||
    type === "clicker.start" ||
    type === "process.run"
  );
}

/** Category tone for action-list `#` coloring (see shell.css `[data-tone]`). */
export function actionTone(type: MacroAction["type"]): string {
  switch (type) {
    case "control.if":
    case "control.while":
      return "logic";
    case "mouse.click":
    case "mouse.move":
    case "mouse.down":
    case "mouse.up":
    case "mouse.wheel":
      return "mouse";
    case "key.tap":
    case "key.down":
    case "key.up":
      return "key";
    case "delay":
      return "wait";
    case "var.set":
    case "clipboard.set":
    case "clipboard.get":
      return "data";
    case "macro.run":
    case "clicker.start":
    case "http.request":
    case "json.path":
    case "process.run":
      return "system";
    case "script.run":
      return "run";
    default:
      return "run";
  }
}

export function branchLabel(
  branch: "then" | "else" | "body",
  t: TFunction,
): string {
  if (branch === "then") return t("macros.action.branch.then");
  if (branch === "else") return t("macros.action.branch.else");
  return t("macros.action.branch.body");
}

/** Index of matching `mouse.up` if `start` begins a down→moves→up drag; else null. */
export function dragGestureEndIndex(
  list: MacroAction[],
  start: number,
): number | null {
  if (list[start]?.type !== "mouse.down") return null;
  let i = start + 1;
  let sawMove = false;
  while (i < list.length) {
    const typ = list[i]?.type;
    if (typ === "mouse.move") {
      sawMove = true;
      i += 1;
      continue;
    }
    if (typ === "delay") {
      i += 1;
      continue;
    }
    if (typ === "mouse.up" && sawMove) return i;
    break;
  }
  return null;
}

/** Title that collapses a recorded drag into a readable gesture label. */
export function actionTitleInList(
  list: MacroAction[],
  index: number,
  t: TFunction,
): string {
  const action = list[index];
  if (!action) return "";
  const end = dragGestureEndIndex(list, index);
  if (end != null) return t("macros.action.title.drag");
  for (let s = 0; s < index; s++) {
    const e = dragGestureEndIndex(list, s);
    if (e == null || index > e || index <= s) continue;
    if (index === e && action.type === "mouse.up") {
      return t("macros.action.title.dragEnd");
    }
    if (action.type === "mouse.move") {
      return t("macros.action.title.trajectory");
    }
  }
  return actionTitle(action.type, t);
}

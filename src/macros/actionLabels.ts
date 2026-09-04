import { formatKeyChord, type Condition, type MacroAction } from "./types";

export function actionTitleFr(type: MacroAction["type"]): string {
  switch (type) {
    case "mouse.click":
      return "Clic";
    case "mouse.move":
      return "Déplacer";
    case "mouse.down":
      return "Enfoncer";
    case "mouse.up":
      return "Relâcher";
    case "mouse.wheel":
      return "Molette";
    case "delay":
      return "Délai";
    case "process.run":
      return "Processus";
    case "http.request":
      return "HTTP";
    case "json.path":
      return "JSON path";
    case "script.run":
      return "Script";
    case "key.tap":
      return "Touche";
    case "key.down":
      return "Maintenir";
    case "key.up":
      return "Relâcher touche";
    case "clipboard.set":
      return "Copier";
    case "clipboard.get":
      return "Coller depuis le presse-papiers";
    case "var.set":
      return "Variable";
    case "control.if":
      return "Si";
    case "control.while":
      return "Tant que";
  }
}

export function mouseButtonFr(button?: string | null): string {
  switch (button) {
    case "right":
      return "Droit";
    case "middle":
      return "Molette";
    default:
      return "Gauche";
  }
}

function xySuffix(x?: number | null, y?: number | null): string {
  if (x != null && y != null) return ` @ ${x}, ${y}`;
  return "";
}

function formatCond(condition: Condition): string {
  const { left, op, right } = condition;
  const L =
    typeof left === "object" && left && "var" in left
      ? `$${left.var}`
      : JSON.stringify(left);
  const R =
    typeof right === "object" && right && "var" in right
      ? `$${right.var}`
      : JSON.stringify(right);
  return `${L} ${op} ${R}`;
}

export function actionDetailFr(action: MacroAction): string {
  switch (action.type) {
    case "mouse.click":
    case "mouse.down":
    case "mouse.up":
      return `${mouseButtonFr(action.button)}${xySuffix(action.x, action.y)}`;
    case "mouse.move":
      return `${action.x}, ${action.y}`;
    case "mouse.wheel":
      return `${action.delta}${xySuffix(action.x, action.y)}`;
    case "delay":
      return `${action.ms} ms`;
    case "process.run":
      return action.command;
    case "http.request": {
      const host = action.url.replace(/^https?:\/\//, "");
      return `${action.method ?? "GET"} ${host}`;
    }
    case "json.path":
      return `${action.sourceVar}.${action.path || "…"} → ${action.destVar}`;
    case "script.run":
      return action.scriptId
        ? `@${action.scriptId}`
        : action.source?.trim()
          ? "inline"
          : "(vide)";
    case "key.tap":
    case "key.down":
    case "key.up":
      return formatKeyChord(action.key, action.mods);
    case "clipboard.set": {
      const t = action.text.trim();
      return t ? t.slice(0, 32) : "(vide)";
    }
    case "clipboard.get":
      return action.name ? `→ ${action.name}` : "(vide)";
    case "var.set":
      return `${action.name} = ${JSON.stringify(action.value)}`;
    case "control.if":
      return formatCond(action.condition);
    case "control.while":
      return formatCond(action.condition);
  }
}

export function actionTone(type: MacroAction["type"]): string {
  switch (type) {
    case "mouse.click":
    case "mouse.move":
    case "mouse.down":
    case "mouse.up":
    case "mouse.wheel":
      return "mouse";
    case "delay":
      return "delay";
    case "key.tap":
    case "key.down":
    case "key.up":
      return "key";
    case "clipboard.set":
    case "clipboard.get":
      return "var";
    case "control.if":
      return "if";
    case "control.while":
      return "if";
    case "http.request":
      return "http";
    case "json.path":
      return "var";
    case "script.run":
      return "process";
    case "var.set":
      return "var";
    case "process.run":
      return "process";
  }
}

export function branchLabelFr(branch: "then" | "else"): string {
  return branch === "then" ? "alors" : "sinon";
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
    const t = list[i]?.type;
    if (t === "mouse.move") {
      sawMove = true;
      i += 1;
      continue;
    }
    if (t === "delay") {
      i += 1;
      continue;
    }
    if (t === "mouse.up" && sawMove) return i;
    break;
  }
  return null;
}

/** Title that collapses a recorded drag into a readable geste label. */
export function actionTitleInList(list: MacroAction[], index: number): string {
  const action = list[index];
  if (!action) return "";
  const end = dragGestureEndIndex(list, index);
  if (end != null) return "Glisser";
  for (let s = 0; s < index; s++) {
    const e = dragGestureEndIndex(list, s);
    if (e == null || index > e || index <= s) continue;
    if (index === e && action.type === "mouse.up") return "Fin glisser";
    if (action.type === "mouse.move") return "Trajectoire";
  }
  return actionTitleFr(action.type);
}

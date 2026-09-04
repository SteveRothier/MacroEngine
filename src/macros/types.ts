export type EngineSessionKind = "clicker" | "macro" | "record";

export type EngineStatus = {
  state: string;
  cancelled: boolean;
  message?: string | null;
  sessionKind?: EngineSessionKind | null;
  sessionName?: string | null;
};

export type MacroTrigger =
  | { type: "manual" }
  | { type: "hotkey"; key: string; mods?: KeyMods };

export type MacroValue = boolean | number | string;

export type Operand = { var: string } | MacroValue;

export type CompareOp = "eq" | "ne" | "gt" | "lt" | "gte" | "lte";

export type Condition = {
  predicate?: string;
  value?: string;
  left: Operand;
  op: CompareOp;
  right: Operand;
};

export type ProcessFilterMode = "allow" | "deny";
export type ProcessFilter = {
  enabled: boolean;
  mode: ProcessFilterMode;
  names: string[];
};

export type KeyMods = {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export function formatKeyChord(key: string, mods?: KeyMods | null): string {
  const parts: string[] = [];
  if (mods?.ctrl) parts.push("Ctrl");
  if (mods?.alt) parts.push("Alt");
  if (mods?.shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/**
 * WebView/Ctrl sometimes reports keyCode 1–26 (ASCII control chars) instead of
 * VK A–Z (0x41–0x5A). Map those back when modifiers imply a letter chord.
 */
export function normalizeVk(vk: number, mods?: KeyMods | null): number {
  if (vk >= 1 && vk <= 26 && (mods?.ctrl || mods?.alt)) {
    return 0x40 + vk;
  }
  return vk;
}

const CODE_VK_NAMED: Record<string, number> = {
  Space: 0x20,
  Enter: 0x0d,
  Escape: 0x1b,
  Tab: 0x09,
  Backspace: 0x08,
  Delete: 0x2e,
  Insert: 0x2d,
  Home: 0x24,
  End: 0x23,
  PageUp: 0x21,
  PageDown: 0x22,
  ArrowLeft: 0x25,
  ArrowUp: 0x26,
  ArrowRight: 0x27,
  ArrowDown: 0x28,
  Pause: 0x13,
  CapsLock: 0x14,
  NumLock: 0x90,
  ScrollLock: 0x91,
  ContextMenu: 0x5d,
  NumpadMultiply: 0x6a,
  NumpadAdd: 0x6b,
  NumpadSubtract: 0x6d,
  NumpadDecimal: 0x6e,
  NumpadDivide: 0x6f,
};

/** Resolve a KeyboardEvent to a Windows VK (prefer `code` over keyCode). */
export function eventToVk(e: KeyboardEvent): number | null {
  const code = e.code;
  if (code) {
    const keyM = /^Key([A-Z])$/.exec(code);
    if (keyM) return 0x41 + (keyM[1].charCodeAt(0) - 65);
    const digitM = /^Digit([0-9])$/.exec(code);
    if (digitM) return 0x30 + Number(digitM[1]);
    const numM = /^Numpad([0-9])$/.exec(code);
    if (numM) return 0x60 + Number(numM[1]);
    const fM = /^F([1-9]|1[0-2])$/.exec(code);
    if (fM) return 0x6f + Number(fM[1]);
    const named = CODE_VK_NAMED[code];
    if (named != null) return named;
  }
  if (e.key && e.key.length === 1) {
    const c = e.key.toUpperCase().charCodeAt(0);
    if (c >= 65 && c <= 90) return c;
    if (c >= 48 && c <= 57) return c;
  }
  const raw = e.keyCode || e.which;
  if (!raw || raw === 16 || raw === 17 || raw === 18) return null;
  return normalizeVk(raw, {
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
  });
}

export function triggerHotkeyLabel(trigger: Extract<MacroTrigger, { type: "hotkey" }>): string {
  const n = Number(trigger.key);
  const vk = !Number.isNaN(n) && n > 0 ? normalizeVk(n, trigger.mods) : NaN;
  const keyLabel = !Number.isNaN(vk) ? vkLabel(vk) : trigger.key;
  return formatKeyChord(keyLabel, trigger.mods);
}

export function triggerModsEqual(a?: KeyMods | null, b?: KeyMods | null): boolean {
  return !!a?.ctrl === !!b?.ctrl && !!a?.alt === !!b?.alt && !!a?.shift === !!b?.shift;
}

export function hotkeyTriggerMatches(
  trigger: MacroTrigger,
  vk: number,
  mods: KeyMods,
): boolean {
  if (trigger.type !== "hotkey") return false;
  const tvk = Number(trigger.key);
  if (!Number.isFinite(tvk)) return false;
  if (normalizeVk(tvk, trigger.mods) !== normalizeVk(vk, mods)) return false;
  return triggerModsEqual(trigger.mods, mods);
}

/** Rewrite stored hotkey key if it was captured as an ASCII control code. */
export function normalizeHotkeyTrigger<T extends { type: string; key?: string; mods?: KeyMods }>(
  trigger: T,
): T {
  if (trigger.type !== "hotkey" || trigger.key == null) return trigger;
  const n = Number(trigger.key);
  if (!Number.isFinite(n) || n <= 0) return trigger;
  const fixed = normalizeVk(n, trigger.mods);
  if (fixed === n) return trigger;
  return { ...trigger, key: String(fixed) };
}

export type MacroAction =
  | {
      id: string;
      type: "mouse.click";
      button?: "left" | "right" | "middle";
      x?: number | null;
      y?: number | null;
    }
  | { id: string; type: "mouse.move"; x: number; y: number }
  | {
      id: string;
      type: "mouse.down";
      button?: "left" | "right" | "middle";
      x?: number | null;
      y?: number | null;
    }
  | {
      id: string;
      type: "mouse.up";
      button?: "left" | "right" | "middle";
      x?: number | null;
      y?: number | null;
    }
  | { id: string; type: "delay"; ms: number }
  | {
      id: string;
      type: "http.request";
      method?: string;
      url: string;
      body?: string | null;
      timeoutMs?: number;
      headers?: { name: string; value: string }[];
      statusVar?: string | null;
      bodyVar?: string | null;
    }
  | { id: string; type: "key.tap"; key: string; mods?: KeyMods }
  | { id: string; type: "key.down"; key: string; mods?: KeyMods }
  | { id: string; type: "key.up"; key: string; mods?: KeyMods }
  | { id: string; type: "mouse.wheel"; delta: number; x?: number | null; y?: number | null }
  | { id: string; type: "clipboard.set"; text: string }
  | { id: string; type: "clipboard.get"; name: string }
  | { id: string; type: "var.set"; name: string; value: MacroValue }
  | {
      id: string;
      type: "control.if";
      condition: Condition;
      then: MacroAction[];
      else?: MacroAction[];
    }
  | {
      id: string;
      type: "control.while";
      condition: Condition;
      body: MacroAction[];
      maxIterations?: number;
    }
  | {
      id: string;
      type: "process.run";
      command: string;
      args?: string[];
      wait?: boolean;
      timeoutMs?: number;
    };

export type MacroDocument = {
  schemaVersion: number;
  name: string;
  trigger: MacroTrigger;
  repeatCount: number;
  processFilter?: "inherit" | "off" | "local";
  localProcessFilter?: ProcessFilter;
  actions: MacroAction[];
};

export type HotkeyBindings = {
  actionVk: number;
  actionCtrl?: boolean;
  actionAlt?: boolean;
  actionShift?: boolean;
  macroVk: number;
  pauseVk?: number;
  emergencyVk: number;
};

export function chordLabel(b: {
  actionVk: number;
  actionCtrl?: boolean;
  actionAlt?: boolean;
  actionShift?: boolean;
}): string {
  const parts: string[] = [];
  if (b.actionCtrl) parts.push("Ctrl");
  if (b.actionAlt) parts.push("Alt");
  if (b.actionShift) parts.push("Shift");
  parts.push(vkLabel(b.actionVk));
  return parts.join("+");
}

/** Path into the action tree. For if branches: [...ifPath, 0|1, childIndex]. */
export type ActionPath = number[];

export type FlatRow = {
  path: ActionPath;
  depth: number;
  action: MacroAction;
  branchLabel?: "then" | "else";
};

export function emptyMacro(name = "Nouvelle macro"): MacroDocument {
  return {
    schemaVersion: 6,
    name,
    trigger: { type: "manual" },
    repeatCount: 1,
    actions: [],
  };
}

export function newActionId(): string {
  return `a${Math.random().toString(36).slice(2, 9)}`;
}

const VK_NAMED: Record<number, string> = {
  0x08: "Retour",
  0x09: "Tab",
  0x0d: "Entrée",
  0x10: "Shift",
  0x11: "Ctrl",
  0x12: "Alt",
  0x13: "Pause",
  0x14: "Verr Maj",
  0x1b: "Échap",
  0x20: "Espace",
  0x21: "PgHaut",
  0x22: "PgBas",
  0x23: "Fin",
  0x24: "Début",
  0x25: "←",
  0x26: "↑",
  0x27: "→",
  0x28: "↓",
  0x2d: "Inser",
  0x2e: "Suppr",
  0x5b: "Win",
  0x5c: "Win",
  0x5d: "Menu",
  0x6a: "*",
  0x6b: "+",
  0x6c: "Sépar.",
  0x6d: "-",
  0x6e: ".",
  0x6f: "/",
  0x90: "Verr Num",
  0x91: "Arrêt défil.",
};

export function vkLabel(vk: number): string {
  if (vk >= 0x70 && vk <= 0x7b) return `F${vk - 0x6f}`;
  if (vk >= 0x30 && vk <= 0x39) return String.fromCharCode(vk);
  if (vk >= 0x41 && vk <= 0x5a) return String.fromCharCode(vk);
  if (vk >= 0x60 && vk <= 0x69) return `Pavé ${vk - 0x60}`;
  const named = VK_NAMED[vk];
  if (named) return named;
  return `0x${vk.toString(16).toUpperCase()}`;
}

export function pathKey(path: ActionPath): string {
  return path.join(".");
}

export function pathsEqual(a: ActionPath | null, b: ActionPath | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((n, i) => n === b[i]);
}

/** DFS flatten for nested if/then/else. */
export function flattenTree(actions: MacroAction[]): FlatRow[] {
  const rows: FlatRow[] = [];

  function visit(list: MacroAction[], prefix: ActionPath, depth: number) {
    list.forEach((action, index) => {
      const path = [...prefix, index];
      rows.push({ path, depth, action });
      if (action.type === "control.if") {
        visitBranch(action.then ?? [], [...path, 0], depth + 1, "then");
        visitBranch(action.else ?? [], [...path, 1], depth + 1, "else");
      }
    });
  }

  function visitBranch(
    list: MacroAction[],
    branchPrefix: ActionPath,
    depth: number,
    label: "then" | "else",
  ) {
    list.forEach((action, index) => {
      const path = [...branchPrefix, index];
      rows.push({
        path,
        depth,
        action,
        branchLabel: label,
      });
      if (action.type === "control.if") {
        visitBranch(action.then ?? [], [...path, 0], depth + 1, "then");
        visitBranch(action.else ?? [], [...path, 1], depth + 1, "else");
      }
    });
  }

  visit(actions, [], 0);
  return rows;
}

export function getAtPath(actions: MacroAction[], path: ActionPath): MacroAction | null {
  if (path.length === 0) return null;

  function go(list: MacroAction[], at: number): MacroAction | null {
    const idx = path[at];
    const node = list[idx];
    if (!node) return null;
    if (at === path.length - 1) return node;
    if (node.type !== "control.if") return null;
    const branch = path[at + 1];
    const next = branch === 0 ? node.then ?? [] : node.else ?? [];
    return go(next, at + 2);
  }

  return go(actions, 0);
}

export function updateAtPath(
  actions: MacroAction[],
  path: ActionPath,
  next: MacroAction,
): MacroAction[] {
  return rewriteList(actions, path, (list, idx) =>
    list.map((a, i) => (i === idx ? next : a)),
  );
}

export function removeAtPath(actions: MacroAction[], path: ActionPath): MacroAction[] {
  return rewriteList(actions, path, (list, idx) => list.filter((_, i) => i !== idx));
}

export function appendChild(
  actions: MacroAction[],
  parentPath: ActionPath,
  branch: "then" | "else",
  child: MacroAction,
): MacroAction[] {
  const parent = getAtPath(actions, parentPath);
  if (!parent || parent.type !== "control.if") return actions;
  const updated: MacroAction = {
    ...parent,
    then: branch === "then" ? [...(parent.then ?? []), child] : parent.then,
    else: branch === "else" ? [...(parent.else ?? []), child] : parent.else,
  };
  return updateAtPath(actions, parentPath, updated);
}

export function moveInParent(
  actions: MacroAction[],
  path: ActionPath,
  dir: -1 | 1,
): MacroAction[] | null {
  const leaf = path[path.length - 1];
  const to = leaf + dir;
  if (to < 0) return null;

  let siblingCount = 0;
  if (path.length === 1) {
    siblingCount = actions.length;
  } else {
    const branch = path[path.length - 2];
    const ifPath = path.slice(0, -2);
    const parent = getAtPath(actions, ifPath);
    if (!parent || parent.type !== "control.if") return null;
    siblingCount = (branch === 0 ? parent.then : parent.else)?.length ?? 0;
  }
  if (to >= siblingCount) return null;

  return rewriteList(actions, path, (list, idx) => {
    const next = list.slice();
    const [item] = next.splice(idx, 1);
    next.splice(to, 0, item);
    return next;
  });
}

/** Reorder within the list identified by `parentPath` (empty = root). */
export function reorderInParent(
  actions: MacroAction[],
  parentPath: ActionPath,
  from: number,
  to: number,
): MacroAction[] {
  if (from === to) return actions;
  if (parentPath.length === 0) {
    return reorderTopLevel(actions, from, to);
  }
  return rewriteList(actions, [...parentPath, from], (list, idx) => {
    if (to < 0 || to >= list.length) return list;
    const next = list.slice();
    const [item] = next.splice(idx, 1);
    next.splice(to, 0, item);
    return next;
  });
}

/** Reorder a top-level action from `from` to `to` (absolute indices). */
export function reorderTopLevel(
  actions: MacroAction[],
  from: number,
  to: number,
): MacroAction[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= actions.length ||
    to >= actions.length
  ) {
    return actions;
  }
  const next = actions.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Reorder within the same parent list (root or if branch). */
export function reorderAtPath(
  actions: MacroAction[],
  fromPath: ActionPath,
  toPath: ActionPath,
): MacroAction[] {
  const fromParent = fromPath.slice(0, -1);
  const toParent = toPath.slice(0, -1);
  if (!pathsEqual(fromParent, toParent)) return actions;
  const fromIdx = fromPath[fromPath.length - 1]!;
  const toIdx = toPath[toPath.length - 1]!;
  if (fromIdx === toIdx) return actions;

  return rewriteList(actions, fromPath, (list) => {
    if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length) {
      return list;
    }
    const next = list.slice();
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    return next;
  });
}

function rewriteList(
  actions: MacroAction[],
  path: ActionPath,
  f: (list: MacroAction[], leafIndex: number) => MacroAction[],
): MacroAction[] {
  function go(list: MacroAction[], at: number): MacroAction[] {
    if (at === path.length - 1) {
      return f(list, path[at]);
    }
    const idx = path[at];
    return list.map((action, i) => {
      if (i !== idx || action.type !== "control.if") return action;
      const branch = path[at + 1];
      if (branch === 0) {
        return { ...action, then: go(action.then ?? [], at + 2) };
      }
      return { ...action, else: go(action.else ?? [], at + 2) };
    });
  }
  return go(actions, 0);
}

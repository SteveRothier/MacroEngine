import type { ActionPath, MacroAction } from "./types";

function actionDurationMs(action: MacroAction): number {
  if (action.type === "delay") return action.ms;
  return 0;
}

/** Cumulative ms from sequence start along the path. */
export function actionOffsetMs(actions: MacroAction[], path: ActionPath): number {
  let total = 0;
  let list = actions;
  for (let depth = 0; depth < path.length; depth++) {
    const idx = path[depth]!;
    for (let j = 0; j < idx; j++) {
      total += actionDurationMs(list[j]!);
    }
    if (depth === path.length - 1) break;
    const node = list[idx];
    if (!node || node.type !== "control.if") break;
    const branchIdx = path[depth + 1]!;
    list = branchIdx === 0 ? node.then : node.else ?? [];
  }
  return total;
}

export function formatActionOffset(
  actions: MacroAction[],
  path: ActionPath,
  prevOffset: number,
): string {
  const offset = actionOffsetMs(actions, path);
  if (offset === 0 && prevOffset === 0) return "0ms";
  const delta = offset - prevOffset;
  if (delta <= 0) return `${offset}ms`;
  return `+${delta}ms`;
}

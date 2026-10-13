import {
  adjustPathAfterRemove,
  pathKey,
  pathsEqual,
  type ActionPath,
} from "./types";

export function pathHasPrefix(path: ActionPath, prefix: ActionPath): boolean {
  if (path.length < prefix.length) return false;
  return pathsEqual(path.slice(0, prefix.length), prefix);
}

export function parsePathKey(key: string): ActionPath | null {
  if (key === "") return [];
  const parts = key.split(".").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts;
}

/** After inserting at `inserted`, bump later siblings that share the same parent. */
export function adjustPathAfterInsert(
  inserted: ActionPath,
  target: ActionPath,
): ActionPath {
  if (inserted.length === 0 || target.length === 0) return target;
  const parentLen = inserted.length - 1;
  if (target.length <= parentLen) return target;
  const sameParent = inserted
    .slice(0, parentLen)
    .every((n, i) => target[i] === n);
  if (!sameParent) return target;
  const out = target.slice();
  const insertIdx = inserted[parentLen]!;
  if (out[parentLen]! >= insertIdx) {
    out[parentLen] = out[parentLen]! + 1;
  }
  return out;
}

/** Destination path of a moved action (mirrors moveAtPath / same-parent reorder). */
export function destPathAfterReorder(
  fromPath: ActionPath,
  toPath: ActionPath,
): ActionPath {
  const fromParent = fromPath.slice(0, -1);
  const toParent = toPath.slice(0, -1);
  if (pathsEqual(fromParent, toParent)) return toPath;
  return adjustPathAfterRemove(fromPath, toPath);
}

/** Keep Si/Tant que fold state when the control (or a nested one) moves. */
export function remapCollapsedAfterReorder(
  collapsed: Set<string>,
  fromPath: ActionPath,
  toPath: ActionPath,
): Set<string> {
  if (collapsed.size === 0) return collapsed;
  const dest = destPathAfterReorder(fromPath, toPath);
  const next = new Set<string>();
  for (const key of collapsed) {
    const path = parsePathKey(key);
    if (!path) continue;
    if (pathsEqual(path, fromPath) || pathHasPrefix(path, fromPath)) {
      const suffix = path.slice(fromPath.length);
      next.add(pathKey([...dest, ...suffix]));
      continue;
    }
    const afterRemove = adjustPathAfterRemove(fromPath, path);
    next.add(pathKey(adjustPathAfterInsert(dest, afterRemove)));
  }
  return next;
}

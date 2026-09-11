import { describe, expect, it } from "vitest";

/** Minimal undo/redo stack helpers (mirrors MacroEditorView history). */
function pushUndo<T>(stack: T[], entry: T, max: number): T[] {
  return [...stack, entry].slice(-max);
}

function undoStep<T>(
  past: T[],
  present: T,
  future: T[],
): { past: T[]; present: T; future: T[] } | null {
  if (past.length === 0) return null;
  const previous = past[past.length - 1]!;
  return {
    past: past.slice(0, -1),
    present: previous,
    future: [present, ...future],
  };
}

function redoStep<T>(
  past: T[],
  present: T,
  future: T[],
): { past: T[]; present: T; future: T[] } | null {
  if (future.length === 0) return null;
  const next = future[0]!;
  return {
    past: [...past, present],
    present: next,
    future: future.slice(1),
  };
}

describe("undo/redo stack", () => {
  it("pushes with max and undoes / redoes", () => {
    let past = pushUndo<number>([], 1, 3);
    past = pushUndo(past, 2, 3);
    past = pushUndo(past, 3, 3);
    past = pushUndo(past, 4, 3);
    expect(past).toEqual([2, 3, 4]);

    let present = 5;
    let future: number[] = [];
    const u = undoStep(past, present, future)!;
    expect(u.present).toBe(4);
    expect(u.past).toEqual([2, 3]);
    expect(u.future).toEqual([5]);

    const r = redoStep(u.past, u.present, u.future)!;
    expect(r.present).toBe(5);
    expect(r.past).toEqual([2, 3, 4]);
    expect(r.future).toEqual([]);
  });
});

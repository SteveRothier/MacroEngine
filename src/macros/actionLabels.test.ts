import { describe, expect, it } from "vitest";
import { tStatic } from "../i18n";
import {
  actionTitleInList,
  dragGestureEndIndex,
} from "./actionLabels";
import type { MacroAction } from "./types";

const tFr = (key: string, vars?: Record<string, string | number>) =>
  tStatic("fr", key, vars);
const tEn = (key: string, vars?: Record<string, string | number>) =>
  tStatic("en", key, vars);

function down(id: string): MacroAction {
  return { type: "mouse.down", id, button: "left", x: 0, y: 0 };
}
function move(id: string, x: number, y: number): MacroAction {
  return { type: "mouse.move", id, x, y };
}
function up(id: string): MacroAction {
  return { type: "mouse.up", id, button: "left", x: 40, y: 0 };
}

describe("drag gesture labels", () => {
  it("detects down→moves→up span (fr)", () => {
    const list = [down("a"), move("b", 20, 0), move("c", 40, 0), up("d")];
    expect(dragGestureEndIndex(list, 0)).toBe(3);
    expect(actionTitleInList(list, 0, tFr)).toBe("Glisser");
    expect(actionTitleInList(list, 1, tFr)).toBe("Trajectoire");
    expect(actionTitleInList(list, 3, tFr)).toBe("Fin glisser");
  });

  it("detects down→moves→up span (en)", () => {
    const list = [down("a"), move("b", 20, 0), move("c", 40, 0), up("d")];
    expect(actionTitleInList(list, 0, tEn)).toBe("Drag");
    expect(actionTitleInList(list, 1, tEn)).toBe("Path");
    expect(actionTitleInList(list, 3, tEn)).toBe("End drag");
  });

  it("ignores click without moves", () => {
    const list = [down("a"), up("b")];
    expect(dragGestureEndIndex(list, 0)).toBeNull();
  });
});

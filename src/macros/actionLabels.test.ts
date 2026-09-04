import { describe, expect, it } from "vitest";
import {
  actionTitleInList,
  dragGestureEndIndex,
} from "./actionLabels";
import type { MacroAction } from "./types";

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
  it("detects down→moves→up span", () => {
    const list = [down("a"), move("b", 20, 0), move("c", 40, 0), up("d")];
    expect(dragGestureEndIndex(list, 0)).toBe(3);
    expect(actionTitleInList(list, 0)).toBe("Glisser");
    expect(actionTitleInList(list, 1)).toBe("Trajectoire");
    expect(actionTitleInList(list, 3)).toBe("Fin glisser");
  });

  it("ignores click without moves", () => {
    const list = [down("a"), up("b")];
    expect(dragGestureEndIndex(list, 0)).toBeNull();
  });
});

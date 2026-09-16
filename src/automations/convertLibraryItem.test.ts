import { describe, expect, it } from "vitest";
import { commonConvertTargets, convertTargetsFor } from "./convertLibraryItem";

describe("commonConvertTargets", () => {
  it("intersects targets across kinds", () => {
    expect(
      commonConvertTargets([
        { kind: "macro" },
        { kind: "clicker" },
      ]),
    ).toEqual(["script"]);
  });

  it("ignores locked rows", () => {
    expect(
      commonConvertTargets([
        { kind: "script", locked: true },
        { kind: "macro" },
      ]),
    ).toEqual(convertTargetsFor("macro"));
  });

  it("returns empty when no unlocked rows", () => {
    expect(commonConvertTargets([{ kind: "macro", locked: true }])).toEqual(
      [],
    );
  });
});

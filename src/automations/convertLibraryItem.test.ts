import { describe, expect, it } from "vitest";
import {
  commonConvertTargets,
  convertSuccessMessage,
  convertTargetsFor,
  localizeConvertToken,
  localizeConvertWarning,
} from "./convertLibraryItem";
import type { TFunction } from "../i18n";

const t = ((key: string, params?: Record<string, string | number>) => {
  if (params) return `${key}:${JSON.stringify(params)}`;
  return key;
}) as TFunction;

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

describe("localizeConvertWarning", () => {
  it("maps known engine warning sentences", () => {
    expect(
      localizeConvertWarning(
        "Clicker features beyond fixed clicks+delay are not converted",
        t,
      ),
    ).toBe("automations.convert.warnings.clickerLimited");
    expect(
      localizeConvertWarning("Generated 3 click(s) at ~100 ms", t),
    ).toContain("automations.convert.warnings.generatedClicks");
    expect(localizeConvertToken("script.run wrap", t)).toBe(
      "automations.convert.tokens.scriptRunWrap",
    );
  });

  it("maps soft-fail skipped-actions warning", () => {
    expect(
      localizeConvertWarning(
        "Some macro actions were skipped during clicker conversion",
        t,
      ),
    ).toBe("automations.convert.warnings.macroActionsSkipped");
  });
});

describe("convertSuccessMessage soft-fail report", () => {
  it("includes kept and dropped lines without treating convert as failure", () => {
    const msg = convertSuccessMessage(
      {
        newId: "p1",
        newName: "Preset",
        toKind: "clicker",
        report: {
          kept: ["mouse.click", "delay"],
          dropped: ["key.tap"],
          warnings: [
            "Some macro actions were skipped during clicker conversion",
          ],
        },
      },
      t,
    );
    expect(msg).toContain("automations.convert.success");
    expect(msg).toContain("automations.convert.kept");
    expect(msg).toContain("automations.convert.dropped");
    expect(msg).toContain("automations.convert.warnings.macroActionsSkipped");
  });
});

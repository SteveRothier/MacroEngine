import { describe, expect, it } from "vitest";
import { tStatic } from "../i18n";
import { formatRelativeRun } from "./relativeTime";

const t = (key: string, vars?: Record<string, string | number>) =>
  tStatic("fr", key, vars);

describe("formatRelativeRun", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");

  it("handles minutes and hours", () => {
    expect(formatRelativeRun(now - 30_000, t, now)).toBe("à l’instant");
    expect(formatRelativeRun(now - 120_000, t, now)).toBe("il y a 2 min");
    expect(formatRelativeRun(now - 3_600_000, t, now)).toBe("il y a 1 h");
  });

  it("handles days", () => {
    expect(formatRelativeRun(now - 86_400_000, t, now)).toBe("hier");
    expect(formatRelativeRun(now - 3 * 86_400_000, t, now)).toBe("il y a 3 j");
  });
});

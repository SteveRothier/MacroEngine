import { describe, expect, it } from "vitest";
import { formatRelativeRunFr } from "./relativeTime";

describe("formatRelativeRunFr", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");

  it("handles minutes and hours", () => {
    expect(formatRelativeRunFr(now - 30_000, now)).toBe("à l’instant");
    expect(formatRelativeRunFr(now - 120_000, now)).toBe("il y a 2 min");
    expect(formatRelativeRunFr(now - 3_600_000, now)).toBe("il y a 1 h");
  });

  it("handles days", () => {
    expect(formatRelativeRunFr(now - 86_400_000, now)).toBe("hier");
    expect(formatRelativeRunFr(now - 3 * 86_400_000, now)).toBe("il y a 3 j");
  });
});

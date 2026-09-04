import { describe, expect, it } from "vitest";
import {
  eventToVk,
  normalizeVk,
  triggerHotkeyLabel,
  vkLabel,
} from "./types";

describe("vkLabel", () => {
  it("maps F-keys and alphanumerics", () => {
    expect(vkLabel(0x70)).toBe("F1");
    expect(vkLabel(0x7b)).toBe("F12");
    expect(vkLabel(0x41)).toBe("A");
    expect(vkLabel(0x39)).toBe("9");
  });

  it("maps Pause and other specials instead of hex", () => {
    expect(vkLabel(0x13)).toBe("Pause");
    expect(vkLabel(0x20)).toBe("Espace");
    expect(vkLabel(0x0d)).toBe("Entrée");
    expect(vkLabel(0x1b)).toBe("Échap");
    expect(vkLabel(0x25)).toBe("←");
    expect(vkLabel(0x60)).toBe("Pavé 0");
  });

  it("falls back to hex for unknown codes", () => {
    expect(vkLabel(0xe8)).toBe("0xE8");
  });
});

describe("normalizeVk / triggerHotkeyLabel", () => {
  it("maps Ctrl+ASCII control codes to letters", () => {
    expect(normalizeVk(3, { ctrl: true })).toBe(0x43);
    expect(
      triggerHotkeyLabel({ type: "hotkey", key: "3", mods: { ctrl: true } }),
    ).toBe("Ctrl+C");
  });

  it("leaves Pause alone without ctrl", () => {
    expect(normalizeVk(0x13)).toBe(0x13);
    expect(vkLabel(0x13)).toBe("Pause");
  });
});

describe("eventToVk", () => {
  it("prefers KeyboardEvent.code for letters", () => {
    const e = {
      code: "KeyC",
      key: "c",
      keyCode: 3,
      which: 3,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent;
    expect(eventToVk(e)).toBe(0x43);
  });
});

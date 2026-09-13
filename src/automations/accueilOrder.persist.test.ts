import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import {
  ACCUEIL_ORDER_KEY,
  loadAccueilOrder,
  saveAccueilOrder,
} from "./accueilOrder";

describe("accueilOrder persist (invoke)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    store.clear();
  });

  it("loadAccueilOrder reads engine keys", async () => {
    invokeMock.mockResolvedValueOnce(["macro:A", "script:B"]);
    await expect(loadAccueilOrder()).resolves.toEqual(["macro:A", "script:B"]);
    expect(invokeMock).toHaveBeenCalledWith("get_accueil_order_cmd");
  });

  it("loadAccueilOrder migrates legacy localStorage when engine empty", async () => {
    store.set(ACCUEIL_ORDER_KEY, JSON.stringify(["clicker:X", "macro:Y"]));
    invokeMock.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    await expect(loadAccueilOrder()).resolves.toEqual([
      "clicker:X",
      "macro:Y",
    ]);
    expect(invokeMock).toHaveBeenCalledWith("set_accueil_order_cmd", {
      keys: ["clicker:X", "macro:Y"],
    });
    expect(store.get(ACCUEIL_ORDER_KEY)).toBeUndefined();
  });

  it("saveAccueilOrder invokes set_accueil_order_cmd", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await saveAccueilOrder(["macro:1", "clicker:2"]);
    expect(invokeMock).toHaveBeenCalledWith("set_accueil_order_cmd", {
      keys: ["macro:1", "clicker:2"],
    });
  });

  it("saveAccueilOrder falls back to localStorage on invoke failure", async () => {
    invokeMock.mockRejectedValueOnce(new Error("offline"));
    await saveAccueilOrder(["script:Z"]);
    expect(store.get(ACCUEIL_ORDER_KEY)).toBe(JSON.stringify(["script:Z"]));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStored, readStoredList, writeStored, writeStoredList } from "./local";

/** A minimal `localStorage`, as the browser has and Node lacks. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

describe("device storage", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps, reads back and forgets a value", () => {
    expect(readStored("k")).toBeNull();
    expect(writeStored("k", "v")).toBe(true);
    expect(readStored("k")).toBe("v");
    expect(writeStored("k", null)).toBe(true);
    expect(readStored("k")).toBeNull();
  });

  it("reads a list back, and anything that is not one as empty", () => {
    expect(readStoredList("list")).toEqual([]);
    writeStoredList("list", [{ a: 1 }, { a: 2 }]);
    expect(readStoredList("list")).toEqual([{ a: 1 }, { a: 2 }]);
    localStorage.setItem("list", "{\"a\":1}");
    expect(readStoredList("list")).toEqual([]);
    localStorage.setItem("list", "not json");
    expect(readStoredList("list")).toEqual([]);
  });

  it("degrades to not remembering when storage refuses or is missing", () => {
    const refusing = memoryStorage();
    refusing.getItem = () => {
      throw new Error("SecurityError");
    };
    refusing.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    vi.stubGlobal("localStorage", refusing);
    expect(readStored("k")).toBeNull();
    expect(writeStored("k", "v")).toBe(false);
    expect(readStoredList("k")).toEqual([]);
    vi.stubGlobal("localStorage", undefined);
    expect(readStored("k")).toBeNull();
    expect(writeStoredList("k", [1])).toBe(false);
  });
});

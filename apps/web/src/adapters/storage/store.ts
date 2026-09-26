/* A `DeviceStore` over any get/set/remove, so the JSON-list rules are written
 * once for the browser's `localStorage` and the tests' Map alike. */

import type { DeviceStore } from "@/ports";

/** The three primitives a backing store must offer. Each may throw; the store absorbs it. */
export interface StoreBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function storeOver(backend: StoreBackend): DeviceStore {
  const read = (key: string): string | null => {
    try {
      return backend.get(key);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string | null): boolean => {
    try {
      if (value === null) backend.remove(key);
      else backend.set(key, value);
      return true;
    } catch {
      return false;
    }
  };
  return {
    read,
    write,
    readList<T>(key: string): T[] {
      const raw = read(key);
      if (raw === null) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch {
        return [];
      }
    },
    writeList<T>(key: string, items: readonly T[]): boolean {
      return write(key, JSON.stringify(items));
    },
  };
}

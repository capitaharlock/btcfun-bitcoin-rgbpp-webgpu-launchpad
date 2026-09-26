/* A `DeviceStore` in memory: what the Node scripts and the unit tests compose
 * with, so the modules that remember things run their real code against a
 * store that exists, instead of a shimmed `localStorage`. */

import type { DeviceStore } from "@/ports";
import { storeOver } from "./store";

export function memoryStore(): DeviceStore {
  const map = new Map<string, string>();
  return storeOver({
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  });
}

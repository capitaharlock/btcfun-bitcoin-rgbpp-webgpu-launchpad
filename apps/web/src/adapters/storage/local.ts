/* What this device keeps: `localStorage`, read and written so that it can fail.
 *
 * Storage is missing in Node, refused in a private window or with site data
 * blocked, and full at its quota. Nothing kept here is the only copy of
 * anything that matters — the chain and the index hold the truth — so every
 * failure degrades to "not remembered" and never throws into the caller.
 */

import { storeOver } from "./store";

/** The browser's storage as the `DeviceStore` port. The one instance the app composes with. */
export const browserStore = storeOver({
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
});

/** The value kept under `key`, or null when there is none or storage is unavailable. */
export const readStored = (key: string): string | null => browserStore.read(key);

/** Keep `value` under `key`, or forget it when null. False when storage refused. */
export const writeStored = (key: string, value: string | null): boolean => browserStore.write(key, value);

/** See `DeviceStore.readList`. */
export const readStoredList = <T>(key: string): T[] => browserStore.readList<T>(key);

/** See `DeviceStore.writeList`. */
export const writeStoredList = <T>(key: string, items: readonly T[]): boolean => browserStore.writeList(key, items);

/* What this device keeps: `localStorage`, read and written so that it can fail.
 *
 * Storage is missing in Node, refused in a private window or with site data
 * blocked, and full at its quota. Nothing kept here is the only copy of
 * anything that matters — the chain and the index hold the truth — so every
 * failure degrades to "not remembered" and never throws into the caller.
 */

/** The value kept under `key`, or null when there is none or storage is unavailable. */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Keep `value` under `key`, or forget it when null. False when storage refused. */
export function writeStored(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The JSON array kept under `key`, or empty when there is none, it is not an
 * array, or it does not parse. The elements are not checked: a caller that
 * trusts them only as far as it wrote them re-validates what it relies on.
 */
export function readStoredList<T>(key: string): T[] {
  const raw = readStored(key);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Keep `items` under `key` as JSON. False when storage refused. */
export function writeStoredList<T>(key: string, items: readonly T[]): boolean {
  return writeStored(key, JSON.stringify(items));
}

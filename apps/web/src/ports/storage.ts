/* What this device remembers between visits, as a key/value interface.
 *
 * `localStorage` is the browser's implementation; the Node scripts and the
 * unit tests use a Map. Nothing kept through this is the only copy of
 * anything that matters — the chain and the index hold the truth — so an
 * implementation degrades to "not remembered" rather than throwing: a
 * private window, blocked site data or a full quota must never break a flow.
 */

export interface DeviceStore {
  /** The value kept under `key`, or null when there is none or storage is unavailable. */
  read(key: string): string | null;
  /** Keep `value` under `key`, or forget it when null. False when storage refused. */
  write(key: string, value: string | null): boolean;
  /**
   * The JSON array kept under `key`, or empty when there is none, it is not an
   * array, or it does not parse. The elements are not checked: a caller that
   * trusts them only as far as it wrote them re-validates what it relies on.
   */
  readList<T>(key: string): T[];
  /** Keep `items` under `key` as JSON. False when storage refused. */
  writeList<T>(key: string, items: readonly T[]): boolean;
}

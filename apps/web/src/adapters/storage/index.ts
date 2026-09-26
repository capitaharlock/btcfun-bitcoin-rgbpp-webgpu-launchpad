/* Public surface of `adapters/storage`. Everything another module may use is named here;
 * the files behind it are internal. */

export { browserStore, readStored, readStoredList, writeStored, writeStoredList } from "./local";
export { memoryStore } from "./memory";
export { progressStore } from "./progress";

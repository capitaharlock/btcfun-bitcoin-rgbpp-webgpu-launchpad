/* Mining progress kept on the device.
 *
 * The rules — what is stored per ticket, how two tabs' writes merge, how a
 * kept best is re-hashed before it is believed — are `domain/mining/progress.ts`.
 * This only says where the raw store lives: under one key of the device store,
 * which a blocked storage turns into "starts from 0" rather than an error. */

import { PROGRESS_KEY, readProgress, writeProgress, type ProgressStore } from "@/domain/mining";
import type { DeviceStore } from "@/ports";

export function progressStore(store: DeviceStore): ProgressStore {
  return {
    read(key, challenge) {
      return readProgress(store.read(PROGRESS_KEY), key, challenge);
    },
    write(key, progress, challenge) {
      // Storage refused or full: the running session still holds the progress.
      store.write(PROGRESS_KEY, writeProgress(store.read(PROGRESS_KEY), key, progress, challenge));
    },
  };
}

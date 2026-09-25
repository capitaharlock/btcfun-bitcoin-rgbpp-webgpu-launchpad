/* A value kept on this device, as React state.
 *
 * For a choice a person made that should survive a reload — and nothing more:
 * storage can refuse (`lib/storage.ts`), and then the choice still holds for
 * this page. Read once, when the component mounts: a caller whose key can
 * change under a mounted component must remount it (a React `key`) to re-read.
 */

import { useCallback, useState } from "react";

import { readStored, writeStored } from "../lib/storage";

export function useStored(key: string): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState(() => readStored(key));
  const set = useCallback(
    (next: string | null) => {
      writeStored(key, next);
      setValue(next);
    },
    [key],
  );
  return [value, set];
}

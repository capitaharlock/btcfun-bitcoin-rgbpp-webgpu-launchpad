/* A value kept on this device, as React state.
 *
 * For a choice a person made that should survive a reload — and nothing more:
 * storage can refuse (`adapters/storage/local.ts`), and then the choice still holds for
 * this page. Read once, when the component mounts: a caller whose key can
 * change under a mounted component must remount it (a React `key`) to re-read.
 */

import { useCallback, useState } from "react";

import { useServices } from "@/app/providers/ServicesProvider";

export function useStored(key: string): [string | null, (value: string | null) => void] {
  const { storage } = useServices();
  const [value, setValue] = useState(() => storage.read(key));
  const set = useCallback(
    (next: string | null) => {
      storage.write(key, next);
      setValue(next);
    },
    [storage, key],
  );
  return [value, set];
}

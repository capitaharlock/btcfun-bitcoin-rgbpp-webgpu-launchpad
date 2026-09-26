/* One button's worth of async state: busy while it runs, the error if it threw.
 *
 * Every market control signs something and can fail for a reason the person
 * must read — an unspendable seal, a missing wallet, a double spend — so each
 * needs the same pair of states, and a failure is shown where it was caused.
 */

import { useCallback, useState } from "react";

export interface Action {
  busy: boolean;
  error: string | null;
  /** Run `fn`. Resolves to its result, or to null after recording why it threw. */
  run<T>(fn: () => Promise<T>): Promise<T | null>;
}

export function useAction(): Action {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, run };
}

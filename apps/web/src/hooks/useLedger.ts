/* React binding for one launch's ledger.
 *
 * The ledger is synchronous and storage-backed, so there is nothing to await
 * and no loading state; what this hook adds is a validated snapshot that
 * re-derives whenever the chain changes, and a single place where a
 * `LedgerError` becomes a message a person can read.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  LedgerError,
  LocalLedger,
  replay,
  type LaunchRules,
  type LedgerState,
  type SignedRecord,
} from "../lib/ledger";

/** One derivation of the stored chain: what it holds, and why it might not. */
interface Snapshot {
  records: SignedRecord[];
  state: LedgerState | null;
  error: string | null;
}

export interface UseLedger {
  ledger: LocalLedger;
  /** Validated state, or null when the chain does not replay. */
  state: LedgerState | null;
  /** Why the chain does not replay, or why the last action failed. */
  error: string | null;
  records: SignedRecord[];
  /** Atoms held by an identity in the validated state. */
  balanceOf: (identity: string | null | undefined) => bigint;
  append: (record: SignedRecord) => boolean;
  importChain: (json: string) => boolean;
  exportChain: () => string;
  clear: () => void;
  reload: () => void;
}

export function useLedger(rules: LaunchRules): UseLedger {
  // Depend on the fields validation actually uses, not on object identity: a
  // parent that rebuilds `rules` every render would otherwise rebuild the
  // ledger and every memo below it on every keystroke.
  const { launch, version: protocolVersion, network, epochBlocks, minClz, ticketSats } = rules;
  const ledger = useMemo(
    () => new LocalLedger({ ...rules, launch, version: protocolVersion }),
    // `schedule` is a frozen module constant, so it is not part of the key.
    [launch, protocolVersion, network, epochBlocks, minClz, ticketSats], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => setRevision((r) => r + 1), []);

  // Reading and validating are one derivation, because reading can fail too:
  // storage may hold something that is not a chain, and `records()` throws
  // rather than pretending that is an empty wallet. Derived, not stored —
  // setting state here would be a side effect during render, and it is cheap.
  const snapshot = useMemo<Snapshot>(() => {
    try {
      const records = ledger.records();
      return { records, state: replay(records, rules), error: null };
    } catch (err) {
      return { records: [], state: null, error: describe(err) };
    }
    // `rules` is destructured into the ledger key above; `revision` is the
    // invalidation signal for the storage-backed chain.
  }, [ledger, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  // A chain written by another tab is still this wallet's chain.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key?.endsWith(`:${launch}`)) reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [launch, reload]);

  /** Run a mutation, surface its error, refresh on success. */
  const attempt = useCallback(
    (action: () => void): boolean => {
      try {
        action();
        setActionError(null);
        reload();
        return true;
      } catch (err) {
        setActionError(describe(err));
        return false;
      }
    },
    [reload],
  );

  const { state, records } = snapshot;

  return {
    ledger,
    state,
    error: actionError ?? snapshot.error,
    records,
    balanceOf: (identity) => (identity && state ? (state.balances.get(identity) ?? 0n) : 0n),
    append: (record) => attempt(() => void ledger.append(record)),
    importChain: (json) => attempt(() => void ledger.import(json)),
    exportChain: () => ledger.export(),
    clear: () => attempt(() => ledger.clear()),
    reload,
  };
}

function describe(err: unknown): string {
  if (err instanceof LedgerError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

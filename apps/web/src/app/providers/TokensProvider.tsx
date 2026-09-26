/* What this wallet holds on chain, and the operations it has in flight.
 *
 * One provider owns both because they are the same question asked twice: the
 * cells sealed to this wallet's UTXOs are what every screen renders, and an
 * operation in flight is a change to those cells that has not landed yet.
 * The stages an operation passes through are `app/tokens/operations.ts`; how
 * one is sent is `app/tokens/submit.ts`. This keeps the React state and the
 * polling that advances it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ACTIVE_RGBPP, type Plan } from "@/domain/rgbpp";
import { groupCells, type Holdings } from "@/app/tokens/holdings";
import { advanced, isLanding, type Operation, type OperationMeta } from "@/app/tokens/operations";
import { operationsStore } from "@/app/tokens/operations-store";
import { submitOperation, type SubmitOptions } from "@/app/tokens/submit";
import { useServices } from "./ServicesProvider";
import { useWallet } from "./WalletProvider";

export type { Holdings } from "@/app/tokens/holdings";
export type { Operation, OperationKind, OperationStage } from "@/app/tokens/operations";
export type { Signer, SubmitOptions } from "@/app/tokens/submit";

const POLL_MS = 20_000;

interface TokensContextValue {
  holdings: Holdings | null;
  /** True while the first read is outstanding. */
  loading: boolean;
  error: string | null;
  operations: Operation[];
  refresh: () => Promise<void>;
  /**
   * Sign the Bitcoin transaction for `plan`, broadcast it and hand the CKB side
   * to the queue. Returns the operation as recorded.
   */
  submit: (plan: Plan, meta: OperationMeta, options?: SubmitOptions) => Promise<Operation>;
}

const TokensContext = createContext<TokensContextValue | null>(null);

export function TokensProvider({ children }: { children: ReactNode }) {
  const { vault, refresh: refreshWallet } = useWallet();
  const { chain, rgbpp, storage } = useServices();
  const store = useMemo(() => operationsStore(storage), [storage]);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const inFlight = useRef(false);
  const loaded = useRef(false);
  const address = vault?.address ?? null;

  useEffect(() => {
    setOperations(address ? store.read(address) : []);
    setHoldings(null);
    loaded.current = false;
  }, [address, store]);

  const refresh = useCallback(async () => {
    if (!address || inFlight.current) return;
    inFlight.current = true;
    if (!loaded.current) setLoading(true);
    try {
      const cells = await rgbpp.cells(address);
      setHoldings(groupCells(ACTIVE_RGBPP, cells));
      loaded.current = true;
      setError(null);

      // Advance whatever is still in flight. Each is independent: one the
      // service no longer knows about must not stop the others updating.
      const current = store.read(address);
      const open = current.filter(isLanding);
      if (open.length > 0) {
        const updates = await Promise.all(open.map(async (op) => rgbpp.status(op.btcTxid).then((s) => advanced(op, s), () => op)));
        const byTx = new Map(updates.map((op) => [op.btcTxid, op]));
        // The cells were read before these statuses: one that just settled is
        // not in them yet, and the page must never show a settled operation
        // beside the cells it replaced — a paid ticket would look unbought.
        if (updates.some((op) => op.stage === "settled")) setHoldings(groupCells(ACTIVE_RGBPP, await rgbpp.cells(address)));
        const next = current.map((op) => byTx.get(op.btcTxid) ?? op);
        store.write(address, next);
        setOperations(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [address, rgbpp, store]);

  useEffect(() => {
    if (!address) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [address, refresh]);

  const submit = useCallback<TokensContextValue["submit"]>(
    async (plan, meta, options) => {
      if (!vault) throw new Error("Connect a wallet first.");
      try {
        return await submitOperation({ vault, chain, rgbpp, store }, plan, meta, options);
      } finally {
        // Whatever happened, the store is the record: a spend recorded before
        // a failed enqueue must show, and the wallet's coins have moved.
        setOperations(store.read(vault.address));
        void refreshWallet();
      }
    },
    [vault, chain, rgbpp, store, refreshWallet],
  );

  const value = useMemo<TokensContextValue>(
    () => ({ holdings: address ? holdings : null, loading, error, operations, refresh, submit }),
    [address, holdings, loading, error, operations, refresh, submit],
  );

  return <TokensContext.Provider value={value}>{children}</TokensContext.Provider>;
}

export function useTokens(): TokensContextValue {
  const ctx = useContext(TokensContext);
  if (!ctx) throw new Error("useTokens must be used inside <TokensProvider>");
  return ctx;
}

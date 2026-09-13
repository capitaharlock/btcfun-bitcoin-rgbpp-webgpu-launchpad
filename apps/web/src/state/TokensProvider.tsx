/* What this wallet holds on chain, and the operations it has in flight.
 *
 * One provider owns both because they are the same question asked twice: the
 * cells sealed to this wallet's UTXOs are what every screen renders, and an
 * operation in flight is a change to those cells that has not landed yet.
 *
 * An RGB++ operation lands in stages, and each stage is shown as what it is:
 *
 *   sent      the Bitcoin transaction is broadcast; nothing is final
 *   queued    Bitcoin has confirmed it or is about to; the RGB++ queue holds the CKB side
 *   settled   the CKB transaction is committed; the cells exist
 *   failed    the queue gave up; the Bitcoin transaction still stands
 *
 * Operations are kept per address in localStorage, so a reload in the middle
 * of a mint does not forget it. They are a convenience, not a record: the
 * chain is re-read on every poll and is what balances come from.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getFeeRate, getUtxos, type Utxo, type WalletKey } from "../lib/bitcoin";
import { signOperation } from "../lib/rgbpp/bitcoin";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { decodeAmount, decodeMinerCell, SEAL_SATS, type MinerCell, type Plan, type TokenCell } from "../lib/rgbpp/operations";
import { sealFromArgs } from "../lib/rgbpp/seal";
import { RgbppService, type ServiceCell } from "../lib/rgbpp/service";
import { useWallet } from "./WalletProvider";

const POLL_MS = 20_000;
const OPS_KEY = "btcfun:operations:v1";

export type OperationKind = "open" | "ticket" | "mint" | "transfer" | "list" | "buy" | "cancel";
export type OperationStage = "sent" | "queued" | "settled" | "failed";

export interface Operation {
  kind: OperationKind;
  /** Bitcoin txid: the operation's identity. */
  btcTxid: string;
  launchId: string;
  tokenId: string;
  stage: OperationStage;
  ckbTxHash: string | null;
  failure: string | null;
  /** What the operation moves, for display: atoms minted or sent, sats paid. */
  atoms?: string;
  sats?: number;
  /** A ticket's anchor, so mining can start before the ticket settles. */
  anchor?: number;
  at: string;
}

export interface Holdings {
  /** Miner cells, by mint script hash. */
  miners: Map<string, MinerCell[]>;
  /** Token cells, by xUDT type hash. */
  tokens: Map<string, TokenCell[]>;
}

interface TokensContextValue {
  service: RgbppService;
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
  submit: (
    plan: Plan,
    meta: Pick<Operation, "kind" | "launchId" | "tokenId" | "atoms" | "sats" | "anchor">,
    sign?: Signer,
  ) => Promise<Operation>;
}

/**
 * How the Bitcoin transaction for a plan is signed. The default spends the
 * plan's sealed UTXOs from this wallet; a purchase instead completes a
 * seller's signed input (`lib/rgbpp/sale.ts`), so it brings its own.
 */
export type Signer = (key: WalletKey, sealed: Utxo[], free: Utxo[], feeRate: number) => { hex: string };

const TokensContext = createContext<TokensContextValue | null>(null);

export function TokensProvider({ children }: { children: ReactNode }) {
  const { vault, refresh: refreshWallet } = useWallet();
  const service = useMemo(() => new RgbppService(ACTIVE_RGBPP), []);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const inFlight = useRef(false);
  const loaded = useRef(false);
  const address = vault?.address ?? null;

  useEffect(() => {
    setOperations(address ? readOps(address) : []);
    setHoldings(null);
    loaded.current = false;
  }, [address]);

  const persist = useCallback(
    (next: Operation[]) => {
      if (address) writeOps(address, next);
      setOperations(next);
    },
    [address],
  );

  const refresh = useCallback(async () => {
    if (!address || inFlight.current) return;
    inFlight.current = true;
    if (!loaded.current) setLoading(true);
    try {
      const cells = await service.cells(address);
      setHoldings(group(cells));
      loaded.current = true;
      setError(null);

      // Advance whatever is still in flight. Each is independent: one the
      // service no longer knows about must not stop the others updating.
      const current = readOps(address);
      const open = current.filter((op) => op.stage === "sent" || op.stage === "queued");
      if (open.length > 0) {
        const updates = await Promise.all(
          open.map(async (op) => {
            try {
              const status = await service.status(op.btcTxid);
              const stage: OperationStage =
                status.state === "completed" ? "settled" : status.state === "failed" ? "failed" : "queued";
              return { ...op, stage, ckbTxHash: status.ckbTxHash, failure: status.failure };
            } catch {
              return op;
            }
          }),
        );
        const byTx = new Map(updates.map((op) => [op.btcTxid, op]));
        persist(current.map((op) => byTx.get(op.btcTxid) ?? op));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [address, service, persist]);

  useEffect(() => {
    if (!address) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [address, refresh]);

  const submit = useCallback<TokensContextValue["submit"]>(
    async (plan, meta, sign) => {
      if (!vault) throw new Error("Connect a wallet first.");
      // Fresh UTXOs at send time: the polled snapshot may already be spent.
      const [all, free, feeRate] = await Promise.all([
        getUtxos(vault.address),
        service.freeUtxos(vault.address),
        getFeeRate(),
      ]);
      const sealed = sign
        ? []
        : plan.sealsSpent.map((seal) => {
            const utxo = all.find((u: Utxo) => u.txid === seal.txid && u.vout === seal.vout);
            if (!utxo) throw new Error("A cell this operation moves is sealed to a UTXO that is not spendable yet.");
            return utxo;
          });
      // Never fund with a seal. The service reports a UTXO as carrying RGB++
      // cells only once its CKB transaction has landed; until then the seal
      // of an operation still in flight looks like a plain 546-sat output,
      // and spending it would strand the cells it is about to carry.
      const landing = new Set(readOps(vault.address).filter((op) => op.stage === "sent" || op.stage === "queued").map((op) => op.btcTxid));
      const funding = free.filter((u) => u.confirmed && u.value !== SEAL_SATS && !landing.has(u.txid));
      const rate = Math.max(1, feeRate);
      const signed = await vault.use((key) =>
        sign ? sign(key, sealed, funding, rate) : signOperation(key, plan, sealed, funding, rate),
      );
      const btcTxid = await service.broadcast(signed.hex);
      const queued = await service.enqueue(plan, btcTxid);
      const operation: Operation = {
        ...meta,
        btcTxid,
        stage: queued === "failed" ? "failed" : "sent",
        ckbTxHash: null,
        failure: null,
        at: new Date().toISOString(),
      };
      persist([operation, ...readOps(vault.address)]);
      void refreshWallet();
      return operation;
    },
    [vault, service, persist, refreshWallet],
  );

  const value = useMemo<TokensContextValue>(
    () => ({
      service,
      holdings: address ? holdings : null,
      loading,
      error,
      operations,
      refresh,
      submit,
    }),
    [service, address, holdings, loading, error, operations, refresh, submit],
  );

  return <TokensContext.Provider value={value}>{children}</TokensContext.Provider>;
}

export function useTokens(): TokensContextValue {
  const ctx = useContext(TokensContext);
  if (!ctx) throw new Error("useTokens must be used inside <TokensProvider>");
  return ctx;
}

/** Sort the service's cells into miner cells and token cells by type hash. */
function group(cells: ServiceCell[]): Holdings {
  const holdings: Holdings = { miners: new Map(), tokens: new Map() };
  for (const cell of cells) {
    const type = cell.cellOutput.type;
    if (!type || !cell.typeHash) continue;
    let seal;
    try {
      seal = sealFromArgs(cell.cellOutput.lock.args);
    } catch {
      continue;
    }
    const base = {
      outPoint: { txHash: cell.outPoint.txHash, index: Number(cell.outPoint.index) },
      capacity: BigInt(cell.cellOutput.capacity),
      seal,
    };
    if (type.codeHash === ACTIVE_RGBPP.mint.codeHash && type.hashType === ACTIVE_RGBPP.mint.hashType) {
      const data = decodeMinerCell(cell.data);
      if (!data) continue;
      push(holdings.miners, cell.typeHash, { ...base, data });
    } else if (type.codeHash === ACTIVE_RGBPP.xudt.codeHash && type.hashType === ACTIVE_RGBPP.xudt.hashType) {
      push(holdings.tokens, cell.typeHash, { ...base, amount: decodeAmount(cell.data) });
    }
  }
  return holdings;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function readOps(address: string): Operation[] {
  try {
    const all = JSON.parse(localStorage.getItem(OPS_KEY) ?? "{}") as Record<string, Operation[]>;
    return Array.isArray(all[address]) ? all[address] : [];
  } catch {
    return [];
  }
}

function writeOps(address: string, ops: Operation[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(OPS_KEY) ?? "{}") as Record<string, Operation[]>;
    all[address] = ops.slice(0, 100);
    localStorage.setItem(OPS_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: operations still show for this session.
  }
}

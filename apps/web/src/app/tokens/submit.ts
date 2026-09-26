/* Submitting an operation: sign the Bitcoin transaction for a plan, broadcast
 * it, hand the CKB side to the queue — and record every step as it happens.
 *
 * A plain function over ports rather than a method of the provider, so the
 * order of its side effects is tested with fakes. The order is the point: the
 * Bitcoin spend is recorded before the queue is called, because once the
 * transaction is broadcast its seals are spent whether or not the queue ever
 * hears of it, and a later attempt must not fund itself from those outputs.
 */

import type { Utxo, WalletKey } from "@/domain/bitcoin";
import { plainFunding, signOperation, type Plan } from "@/domain/rgbpp";
import type { ChainProvider, RgbppGateway, Vault } from "@/ports";
import { landingTxids, type Operation, type OperationMeta } from "./operations";
import type { OperationsStore } from "./operations-store";

/**
 * How the Bitcoin transaction for a plan is signed. The default spends the
 * plan's sealed UTXOs from this wallet; a purchase instead completes a
 * seller's signed input (`domain/rgbpp/sale.ts`), so it brings its own.
 */
export type Signer = (key: WalletKey, sealed: Utxo[], free: Utxo[], feeRate: number) => { hex: string; txid: string };

export interface SubmitOptions {
  sign?: Signer;
  /**
   * The fee rate to pay, when the caller showed the person a cost at a given
   * rate; without it the provider's recommendation is fetched at send time.
   */
  feeRate?: number;
}

export interface SubmitPorts {
  vault: Vault;
  chain: Pick<ChainProvider, "getUtxos" | "getFeeRate">;
  rgbpp: Pick<RgbppGateway, "freeUtxos" | "broadcast" | "enqueue">;
  store: OperationsStore;
  /** The clock, for the operation's timestamp. */
  now?: () => Date;
}

export async function submitOperation(ports: SubmitPorts, plan: Plan, meta: OperationMeta, options: SubmitOptions = {}): Promise<Operation> {
  const { vault, chain, rgbpp, store } = ports;
  const { sign } = options;
  const { address } = vault;

  // Fresh UTXOs at send time: the polled snapshot may already be spent.
  const [all, free, feeRate] = await Promise.all([
    chain.getUtxos(address),
    rgbpp.freeUtxos(address),
    options.feeRate ?? chain.getFeeRate(),
  ]);
  const sealed = sign
    ? []
    : plan.sealsSpent.map((seal) => {
        const utxo = all.find((u) => u.txid === seal.txid && u.vout === seal.vout);
        if (!utxo) throw new Error("A cell this operation moves is sealed to a UTXO that is not spendable yet.");
        return utxo;
      });
  const funding = plainFunding(free, landingTxids(store.read(address)));
  const rate = Math.max(1, feeRate);
  const signed = await vault.use((key) => (sign ? sign(key, sealed, funding, rate) : signOperation(key, plan, sealed, funding, rate)));

  const serviceTxid = await rgbpp.broadcast(signed.hex);
  const btcTxid = signed.txid;
  const operation: Operation = {
    ...meta,
    btcTxid,
    stage: "sent",
    ckbTxHash: null,
    failure: null,
    at: (ports.now ?? (() => new Date()))().toISOString(),
    ...(meta.newCell ? { hex: signed.hex } : {}),
  };
  // Persist the Bitcoin spend before calling the CKB queue. If enqueue
  // fails, the spend still exists and its seals must remain reserved.
  store.write(address, [operation, ...store.read(address)]);
  if (serviceTxid !== btcTxid) {
    throw new Error(`The Bitcoin service returned ${serviceTxid} for a transaction whose local txid is ${btcTxid}.`);
  }

  const queued = await rgbpp.enqueue(plan, btcTxid);
  const recorded: Operation = { ...operation, stage: queued === "failed" ? "failed" : "queued" };
  store.write(address, [recorded, ...store.read(address).filter((op) => op.btcTxid !== btcTxid)]);
  return recorded;
}

/* What the app needs from the Bitcoin chain, as an interface.
 *
 * Today one adapter serves it, mempool.space's REST API. Two others are
 * foreseeable and both change nothing above this line: a node the operator
 * runs (PROTOCOL.md §3 wants every consequential fact independently
 * checkable, and "check it against your own node" is the strongest form of
 * that), and the fake the tests hand the use cases so a broadcast can fail on
 * purpose. Hooks and use cases therefore take a `ChainProvider`, never the
 * functions of `adapters/mempool`.
 */

import type { AddressBalance, ChainTx, TxStatus, Utxo } from "@/domain/bitcoin";

export interface ChainProvider {
  /** Unspent outputs of an address, largest first. */
  getUtxos(address: string): Promise<Utxo[]>;
  /** The balance as the sum of `getUtxos`, so every satoshi is traceable to an output. */
  getBalance(address: string): Promise<AddressBalance>;
  /** The chain tip: the clock the emission schedule runs on (§6). */
  getTipHeight(): Promise<number>;
  /** Hash of the block at `height`. */
  getBlockHash(height: number): Promise<string>;
  /** Recommended fee rate in sat/vB for an ordinary payment. Never throws: falls back. */
  getFeeRate(): Promise<number>;
  /** The rate mining transactions pay (`domain/mining/fees.ts`). Never throws: falls back. */
  fastFeeRate(): Promise<number>;
  getTx(txid: string): Promise<ChainTx>;
  /** The full serialization, witness included, as hex. */
  getTxHex(txid: string): Promise<string>;
  getTxStatus(txid: string): Promise<TxStatus>;
  /** Recent transactions touching an address, newest first, mempool included. */
  getAddressTxs(address: string): Promise<ChainTx[]>;
  /** Whether an output is spent, confirmed or not. */
  isSpent(txid: string, vout: number): Promise<boolean>;
  /** Publish a signed transaction. Resolves to the txid as the network computed it. */
  broadcast(rawHex: string): Promise<string>;
}

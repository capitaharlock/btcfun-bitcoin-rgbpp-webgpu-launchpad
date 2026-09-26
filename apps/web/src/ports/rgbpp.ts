/* What the app needs from an RGB++ gateway: the cells sealed to an address,
 * the plain coins it may spend, and the queue that completes the CKB side of
 * an operation once Bitcoin has confirmed it.
 *
 * The public RGB++ assets service is the one implementation today. It is a
 * convenience, not an authority: the Bitcoin transaction commits to the CKB
 * transaction, so anyone can complete the same operation from any SPV proof,
 * and an operator running their own queue — or a test that answers `enqueue`
 * with "failed" to see the spend stay recorded — is the second implementation
 * this seam is for.
 */

import type { ccc } from "@ckb-ccc/core";

import type { Utxo } from "@/domain/bitcoin";
import type { Paymaster, Plan } from "@/domain/rgbpp";

/** An RGB++ cell as the gateway reports it: the raw script fields, undecoded. */
export interface RgbppCell {
  outPoint: { txHash: ccc.Hex; index: ccc.Hex };
  cellOutput: {
    capacity: ccc.Hex;
    lock: { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex };
    type?: { codeHash: ccc.Hex; hashType: ccc.HashType; args: ccc.Hex } | null;
  };
  data: ccc.Hex;
  typeHash?: ccc.Hex;
}

export type QueueState = "waiting" | "delayed" | "active" | "completed" | "failed" | "unknown";

export interface QueueStatus {
  state: QueueState;
  /** The CKB transaction hash, once submitted. */
  ckbTxHash: ccc.Hex | null;
  failure: string | null;
}

export interface RgbppGateway {
  /** The paymaster that funds a cell's capacity, and what it charges in sats. */
  paymaster(): Promise<Paymaster>;
  /** UTXOs that seal no RGB++ cell: the only ones safe to spend as plain funding. */
  freeUtxos(address: string): Promise<Utxo[]>;
  /** Every RGB++ cell sealed to one of the address's UTXOs, of any type. */
  cells(address: string): Promise<RgbppCell[]>;
  /** Publish the Bitcoin transaction of an operation. Resolves to its txid. */
  broadcast(hex: string): Promise<string>;
  /** Hand the CKB side of `plan`, committed by `btcTxid`, to the queue. */
  enqueue(plan: Plan, btcTxid: string): Promise<QueueState>;
  status(btcTxid: string): Promise<QueueStatus>;
}

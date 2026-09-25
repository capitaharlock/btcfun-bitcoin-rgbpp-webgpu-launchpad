/* What a plan is, and the part every plan finishes the same way.
 *
 * A plan is everything both chains need, decided before anything is signed:
 * the CKB transaction the Bitcoin transaction will commit to, the sealed
 * Bitcoin outputs it expects, and the payments that go with it. The operations
 * that build one live beside this file (`./ticket.ts`, `./arm.ts`, `./mint.ts`,
 * `./transfer.ts`); `../bitcoin.ts` turns a plan into a signed transaction and
 * `../service.ts` hands the CKB side to the RGB++ queue.
 */

import type { ccc } from "@ckb-ccc/core";

import { commitment, type VirtualTx } from "../commitment";
import type { RgbppConfig } from "../config";
import type { Seal } from "../seal";

/** Every sealed Bitcoin output carries this much; the RGB++ tooling's default. */
export const SEAL_SATS = 546;

/** A Bitcoin output the plan needs besides the commitment. */
export type PlannedOutput =
  | { kind: "seal"; value: number }
  | { kind: "ticket"; script: Uint8Array; value: number }
  | { kind: "fee"; address: string; value: number }
  | { kind: "paymaster"; address: string; value: number }
  | { kind: "payment"; address: string; value: number };

export interface Plan {
  virtualTx: VirtualTx;
  cellDeps: ccc.CellDepLike[];
  commitment: ccc.Hex;
  /** Bitcoin outputs after the commitment, in order; seals come first. */
  btcOutputs: PlannedOutput[];
  /** Sealed UTXOs the Bitcoin transaction must spend. */
  sealsSpent: Seal[];
  /** The queue service adds a paymaster cell for capacity the inputs lack. */
  needPaymasterCell: boolean;
  sumInputsCapacity: bigint;
  /**
   * The btc.fun witness, placed past the inputs' witnesses where the queue
   * leaves it as written: the creating transaction when a paid cell is armed,
   * the nonce when a first mint dissolves the miner cell (`contracts/mint`).
   */
  btcfunWitness?: ccc.Hex;
}

export interface Paymaster {
  address: string;
  feeSats: number;
}

function deps(config: RgbppConfig): ccc.CellDepLike[] {
  return [...config.rgbppLockDeps, config.xudtDep, config.mintDep];
}

/** A plan from its parts: the cell deps it needs and the commitment over its CKB side. */
export function finish(config: RgbppConfig, parts: Omit<Plan, "commitment" | "cellDeps">): Plan {
  // The queue appends the paymaster's input but not the dependency its lock
  // needs; without it CKB cannot find the script and the job fails after the
  // Bitcoin side has already confirmed. Cell deps are outside the commitment.
  const cellDeps = parts.needPaymasterCell ? [...deps(config), config.paymasterLockDep] : deps(config);
  return { ...parts, cellDeps, commitment: commitment(parts.virtualTx) };
}

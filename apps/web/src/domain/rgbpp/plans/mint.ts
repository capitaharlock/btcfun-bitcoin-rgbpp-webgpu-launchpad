/* The mint, planned: the reward for one nonce, paying only the network. */

import { ccc } from "@ckb-ccc/core";

import type { RgbppConfig } from "../config";
import { mintScript, tokenScript, type LaunchTerms } from "../launch";
import { pendingLock } from "../seal";
import { CKB_FEE, occupied } from "../cells/capacity";
import { encodeMinerCell, TICKET_VOUT, type MinerCell } from "../cells/miner";
import { encodeAmount, type TokenCell } from "../cells/token";
import { finish, SEAL_SATS, type Plan } from "./plan";

export interface MintRequest {
  miner: MinerCell;
  /** The miner's existing balance of this token, if any, merged into the new cell. */
  held: TokenCell | null;
  nonce: bigint;
  /** The standard reward for this nonce at the ticket's anchor (`reward()` in `standard.ts`). */
  reward: bigint;
}

/**
 * Mint: pays only the network. The next ticket is a separate transaction: the
 * script refuses a mint that re-arms, so a transaction carrying a balance
 * never depends on when it confirms.
 *
 * With a token cell already held, the miner cell returns to idle at output 1
 * carrying the nonce, and the balance grows by the reward in the token cell at
 * output 2. Without one, the miner cell's capacity becomes the token cell, at
 * output 1: the paymaster's one cell cannot hold both, and the next round
 * pays for a new miner cell instead. The nonce then travels in the btc.fun
 * witness.
 */
export function planMint(config: RgbppConfig, terms: LaunchTerms, request: MintRequest): Plan {
  const { miner, held, nonce, reward } = request;
  if (miner.data.state !== "armed") throw new Error("a mint needs an armed miner cell");
  if (reward <= 0n) throw new RangeError("a mint must mint something");
  const mint = mintScript(config, terms);
  const token = tokenScript(config, mint);

  if (held === null) {
    const capacity = miner.capacity - CKB_FEE;
    const needed = occupied({ lock: pendingLock(config, TICKET_VOUT), type: token }, encodeAmount(reward));
    if (capacity < needed) throw new Error("this miner cell is too small to become the token cell");
    return finish(config, {
      virtualTx: {
        inputs: [miner.outPoint],
        outputs: [{ capacity, lock: pendingLock(config, TICKET_VOUT), type: token }],
        outputsData: [encodeAmount(reward)],
      },
      btcOutputs: [{ kind: "seal", value: SEAL_SATS }],
      sealsSpent: [miner.seal],
      needPaymasterCell: false,
      sumInputsCapacity: miner.capacity,
      btcfunWitness: ccc.hexFrom(ccc.numLeToBytes(nonce, 8)),
    });
  }

  return finish(config, {
    virtualTx: {
      inputs: [miner.outPoint, held.outPoint],
      outputs: [
        { capacity: miner.capacity - CKB_FEE, lock: pendingLock(config, 1), type: mint },
        { capacity: held.capacity, lock: pendingLock(config, 2), type: token },
      ],
      outputsData: [encodeMinerCell({ state: "idle", nonce, anchor: miner.data.anchor }), encodeAmount(held.amount + reward)],
    },
    btcOutputs: [
      { kind: "seal", value: SEAL_SATS },
      { kind: "seal", value: SEAL_SATS },
    ],
    sealsSpent: [miner.seal, held.seal],
    needPaymasterCell: false,
    sumInputsCapacity: miner.capacity + held.capacity,
  });
}

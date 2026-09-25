/* A live cell as a plan consumes it: where it is on CKB and which Bitcoin
 * output it is sealed to. The kinds of cell a btc.fun token has — miner cells
 * (`./miner.ts`) and token cells (`./token.ts`) — extend it with their data.
 */

import type { ccc } from "@ckb-ccc/core";

import type { Seal } from "../seal";

/** A live cell the plan consumes, with the Bitcoin output it is sealed to. */
export interface SealedCell {
  outPoint: ccc.OutPointLike;
  capacity: bigint;
  seal: Seal;
}

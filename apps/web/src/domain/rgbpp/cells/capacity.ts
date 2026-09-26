/* How much CKB a btc.fun cell is opened with, and the fee each operation takes.
 *
 * A cell holding less capacity than it occupies is rejected by every CKB node,
 * and a plan that underfunds one fails only after its Bitcoin side has
 * confirmed — stranding the cell. So every size is computed from the real
 * scripts and data, at the largest the cell ever gets.
 */

import { ccc } from "@ckb-ccc/core";

import type { RgbppConfig } from "../config";
import { mintScript, tokenScript, type LaunchTerms } from "../launch";
import { pendingLock } from "../seal";
import { encodeMinerCell } from "./miner";
import { encodeAmount } from "./token";

/**
 * CKB fee each operation takes from the miner or token cell's spare capacity.
 * A mint's CKB transaction is about 2 KB once the Bitcoin transaction and its
 * proof are in the witness, so this is several times the minimum fee rate.
 */
export const CKB_FEE = 100_000n;
/** Spare capacity a miner cell is opened with, spent on fees over its life. */
export const MINER_FEE_RESERVE = ccc.fixedPointFrom(10);

/** Any ticket: it only has to be the size of one. */
const PLACEHOLDER_NAME = "0".repeat(64);

/**
 * Capacity a cell occupies, data included. CCC's `occupiedSize` counts the
 * output alone, and a cell holding less than output plus data is rejected by
 * every CKB node, so the data length is added here explicitly.
 */
export function occupied(output: ccc.CellOutputLike, data: ccc.HexLike): bigint {
  return ccc.fixedPointFrom(ccc.CellOutput.from({ ...output, capacity: 0 }).occupiedSize + ccc.bytesFrom(data).length);
}

/**
 * Capacity a miner cell is opened with: what it occupies once armed naming its
 * ticket — the largest it gets — plus its fee reserve.
 */
export function minerCellCapacity(config: RgbppConfig, terms: LaunchTerms): bigint {
  const lock = pendingLock(config, 1);
  const data = encodeMinerCell({ state: "armed", nonce: 0n, anchor: 0, ticket: PLACEHOLDER_NAME });
  return occupied({ lock, type: mintScript(config, terms) }, data) + MINER_FEE_RESERVE;
}

/** Capacity a token cell occupies. Tokens pay no fees; they travel with a plan's funding. */
export function tokenCellCapacity(config: RgbppConfig, terms: LaunchTerms): bigint {
  const token = tokenScript(config, mintScript(config, terms));
  return occupied({ lock: pendingLock(config, 1), type: token }, encodeAmount(0n)) + CKB_FEE;
}

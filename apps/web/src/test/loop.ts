/* Fixtures for the mining loop tests: miner cells, operations and a loop
 * input to vary one fact at a time. Never imported by the app. */

import { deriveLoop, type LoopInput, type LoopOperation } from "@/domain/mining";
import type { MinerCell } from "@/domain/rgbpp";

export const cell = (state: "idle" | "armed" | "paid", txid = "aa".repeat(32), anchor = 900): MinerCell => ({
  outPoint: { txHash: "0x" + "12".repeat(32), index: 0 },
  capacity: 1n,
  seal: { txid, vout: 1 },
  data: { state, nonce: 0n, anchor },
});

export const op = (kind: LoopOperation["kind"], btcTxid: string, stage: LoopOperation["stage"], extra: Partial<LoopOperation> = {}): LoopOperation => ({
  kind,
  btcTxid,
  stage,
  ckbTxHash: null,
  failure: null,
  ...extra,
});

const base: LoopInput = {
  wallet: "local",
  launchOpen: true,
  miners: [],
  operations: [],
  bestClz: null,
  dismissed: null,
};

/** The loop a wallet with no cells and no operations is on, with `input` changed. */
export const at = (input: Partial<LoopInput>) => deriveLoop({ ...base, ...input });

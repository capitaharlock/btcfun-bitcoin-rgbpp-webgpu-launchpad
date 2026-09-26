/* Fixtures for the RGB++ plan tests: one launch's terms, the paymaster, and
 * cells sealed to made-up outputs. Shared so each plan's tests read the same
 * world; never imported by the app. */

import { ccc } from "@ckb-ccc/core";

import { displayTxid } from "@/domain/bitcoin";
import { TESTNET } from "@/domain/rgbpp";
import { metadataHash, type LaunchTerms } from "@/domain/rgbpp";
import { minerCellCapacity, tokenCellCapacity } from "@/domain/rgbpp";
import type { MinerCell } from "@/domain/rgbpp";
import type { SealedCell } from "@/domain/rgbpp";

export const terms: LaunchTerms = {
  h0: 4_800_000,
  metadataHash: metadataHash({ name: "Mesh", symbol: "MESH", description: "", imageHash: "" }),
  promoterScript: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0xaa)]),
};
/** Any 96 bytes: plans carry the admission, the script checks it. */
export const ADMISSION = new Uint8Array(96).fill(3);
export const paymaster = { address: "tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj", feeSats: 7000 };
/** The testnet paymaster cell and the smallest change cell it must keep. */
export const PAYMASTER_CELL = ccc.fixedPointFrom(316);
export const MIN_CHANGE = ccc.fixedPointFrom(61);

export const minerCap = minerCellCapacity(TESTNET, terms);
export const tokenCap = tokenCellCapacity(TESTNET, terms);

export const sealed = (vout: number, capacity: bigint): SealedCell => ({
  outPoint: { txHash: "0x" + "12".repeat(32), index: vout },
  capacity,
  seal: { txid: "34".repeat(32), vout },
});
export const miner = (state: "idle" | "armed" | "paid", capacity: bigint): MinerCell => ({
  ...sealed(1, capacity),
  data: { state, nonce: 0n, anchor: terms.h0 },
});
export const sum = (xs: readonly ccc.CellOutputLike[]) => xs.reduce((n, o) => n + ccc.CellOutput.from(o).capacity, 0n);

/** A creating ticket as the arm step reads it: any bytes, identified by their hash. */
export const creating = Uint8Array.from([2, 0, 0, 0, 1, 2, 3]);
export const paid = (): MinerCell => ({
  ...sealed(1, minerCap),
  seal: { txid: displayTxid(creating), vout: 1 },
  data: { state: "paid", nonce: 0n, anchor: 0 },
});

import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import { TICKET_SATS } from "../standard";
import { TESTNET } from "./config";
import { decodeTerms, encodeTerms, metadataHash, mintScript, tokenId, tokenScript, type LaunchTerms } from "./launch";
import {
  CKB_FEE,
  decodeAmount,
  decodeMinerCell,
  encodeMinerCell,
  minerCellCapacity,
  planMint,
  planOpen,
  planTicket,
  planTransfer,
  tokenCellCapacity,
  type SealedCell,
  type TokenCell,
} from "./operations";
import { sealFromArgs, PLACEHOLDER_TXID } from "./seal";

const terms: LaunchTerms = {
  h0: 4_800_000,
  metadataHash: metadataHash({ name: "Mesh", symbol: "MESH", description: "", imageHash: "" }),
  promoterScript: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0xaa)]),
};
const paymaster = { address: "tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj", feeSats: 7000 };
/** The testnet paymaster cell and the smallest change cell it must keep. */
const PAYMASTER_CELL = ccc.fixedPointFrom(316);
const MIN_CHANGE = ccc.fixedPointFrom(61);

const sealed = (vout: number, capacity: bigint): SealedCell => ({
  outPoint: { txHash: "0x" + "12".repeat(32), index: vout },
  capacity,
  seal: { txid: "34".repeat(32), vout },
});
const sum = (xs: readonly ccc.CellOutputLike[]) => xs.reduce((n, o) => n + ccc.CellOutput.from(o).capacity, 0n);

describe("launch identity", () => {
  it("encodes the terms exactly as the mint script parses them", () => {
    const bytes = encodeTerms(terms);
    expect(bytes[0]).toBe(1);
    expect(bytes.length).toBe(1 + 4 + 32 + 1 + 22);
    expect(decodeTerms(bytes)).toEqual(terms);
    expect(() => decodeTerms(ccc.bytesConcat(bytes, [0]))).toThrow();
  });

  it("derives the token from the mint script, owner by input type", () => {
    const mint = mintScript(TESTNET, terms);
    const token = tokenScript(TESTNET, mint);
    expect(token.args).toBe(mint.hash() + "00000080");
    expect(tokenId(TESTNET, terms)).toBe(token.hash());
    expect(tokenId(TESTNET, { ...terms, h0: terms.h0 + 1 })).not.toBe(token.hash());
  });
});

describe("miner cell", () => {
  it("is a state byte and a little-endian nonce, as in mint-core", () => {
    expect(encodeMinerCell({ state: "armed", nonce: 0x0102030405060708n })).toBe("0x010807060504030201");
    expect(decodeMinerCell("0x000000000000000000")).toEqual({ state: "idle", nonce: 0n });
    expect(decodeMinerCell("0x02")).toBeNull();
  });
});

describe("plans", () => {
  const minerCap = minerCellCapacity(TESTNET, terms);
  const tokenCap = tokenCellCapacity(TESTNET, terms);

  it("open fits in one paymaster cell and seals the miner to output 1", () => {
    const plan = planOpen(TESTNET, terms, paymaster);
    expect(plan.needPaymasterCell).toBe(true);
    expect(PAYMASTER_CELL > sum(plan.virtualTx.outputs) + MIN_CHANGE).toBe(true);
    const lock = ccc.CellOutput.from(plan.virtualTx.outputs[0]).lock;
    expect(sealFromArgs(lock.args)).toEqual({ txid: PLACEHOLDER_TXID, vout: 1 });
    expect(plan.btcOutputs.map((o) => o.kind)).toEqual(["seal", "paymaster"]);
  });

  it("a ticket pays the promoter the standard price and spends only the fee", () => {
    const plan = planTicket(TESTNET, terms, sealed(1, minerCap));
    expect(plan.btcOutputs[1]).toMatchObject({ kind: "ticket", value: TICKET_SATS });
    expect(plan.sumInputsCapacity - sum(plan.virtualTx.outputs)).toBe(CKB_FEE);
    expect(decodeMinerCell(plan.virtualTx.outputsData[0])?.state).toBe("armed");
  });

  it("a first mint borrows the token cell from the paymaster, within its cell", () => {
    const plan = planMint(TESTNET, terms, {
      miner: sealed(1, minerCap),
      held: null,
      nonce: 42n,
      reward: 25_600_000_000n,
      rearm: false,
      paymaster,
    });
    expect(plan.needPaymasterCell).toBe(true);
    expect(plan.sumInputsCapacity + PAYMASTER_CELL > sum(plan.virtualTx.outputs) + MIN_CHANGE).toBe(true);
    // Miner and tokens on different outputs, the nonce in the miner cell.
    const [miner, token] = plan.virtualTx.outputs.map((o) => sealFromArgs(ccc.CellOutput.from(o).lock.args).vout);
    expect([miner, token]).toEqual([1, 2]);
    expect(decodeMinerCell(plan.virtualTx.outputsData[0])).toEqual({ state: "idle", nonce: 42n });
    expect(decodeAmount(plan.virtualTx.outputsData[1])).toBe(25_600_000_000n);
  });

  it("a later mint adds to the held balance and pays only the fee", () => {
    const held: TokenCell = { ...sealed(2, tokenCap), amount: 1_000n };
    const plan = planMint(TESTNET, terms, {
      miner: sealed(1, minerCap),
      held,
      nonce: 7n,
      reward: 500n,
      rearm: true,
      paymaster: null,
    });
    expect(plan.needPaymasterCell).toBe(false);
    expect(plan.sumInputsCapacity - sum(plan.virtualTx.outputs)).toBe(CKB_FEE);
    expect(decodeAmount(plan.virtualTx.outputsData[1])).toBe(1_500n);
    expect(plan.btcOutputs.map((o) => o.kind)).toEqual(["seal", "seal", "ticket"]);
    expect(plan.sealsSpent).toHaveLength(2);
  });

  it("refuses a mint of nothing, and a first mint without the paymaster", () => {
    const base = { miner: sealed(1, minerCap), held: null, nonce: 1n, rearm: false };
    expect(() => planMint(TESTNET, terms, { ...base, reward: 0n, paymaster })).toThrow();
    expect(() => planMint(TESTNET, terms, { ...base, reward: 1n, paymaster: null })).toThrow();
  });

  it("a transfer with change needs capacity for a second cell; a whole-cell transfer does not", () => {
    const from: TokenCell[] = [{ ...sealed(2, tokenCap), amount: 1_000n }];
    const partial = planTransfer(TESTNET, terms, { from, amount: 300n, paymaster });
    expect(partial.needPaymasterCell).toBe(true);
    expect(partial.virtualTx.outputsData.map(decodeAmount)).toEqual([300n, 700n]);

    const whole = planTransfer(TESTNET, terms, { from, amount: 1_000n, paymaster });
    expect(whole.needPaymasterCell).toBe(false);
    expect(whole.sumInputsCapacity - sum(whole.virtualTx.outputs)).toBe(CKB_FEE);
    expect(() => planTransfer(TESTNET, terms, { from, amount: 1_001n, paymaster })).toThrow();
  });
});

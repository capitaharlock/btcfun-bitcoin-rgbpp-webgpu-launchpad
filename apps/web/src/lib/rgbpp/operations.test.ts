import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import { NEW_CELL, REUSE } from "../standard";
import { TESTNET } from "./config";
import { decodeTerms, encodeTerms, metadataHash, mintScript, tokenId, tokenScript, type LaunchTerms } from "./launch";
import {
  CKB_FEE,
  decodeAmount,
  decodeMinerCell,
  encodeMinerCell,
  minerCellCapacity,
  displayTxid,
  planArm,
  planMint,
  planTicket,
  planTransfer,
  tokenCellCapacity,
  type MinerCell,
  type SealedCell,
  type TokenCell,
} from "./operations";
import { sealFromArgs, PLACEHOLDER_TXID } from "./seal";
import { virtualResult } from "./service";

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
const miner = (state: "idle" | "armed" | "paid", capacity: bigint): MinerCell => ({
  ...sealed(1, capacity),
  data: { state, nonce: 0n, anchor: terms.h0 },
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
  it("is a state byte, a nonce and an anchor, little-endian, as in mint-core", () => {
    const cell = { state: "armed", nonce: 0x0102030405060708n, anchor: 0x0a0b0c0d } as const;
    expect(encodeMinerCell(cell)).toBe("0x0108070605040302010d0c0b0a");
    expect(decodeMinerCell(encodeMinerCell(cell))).toEqual(cell);
    expect(decodeMinerCell("0x" + "00".repeat(9))).toBeNull();
    expect(decodeMinerCell("0x02" + "00".repeat(12))).toEqual({ state: "paid", nonce: 0n, anchor: 0 });
    expect(decodeMinerCell("0x03" + "00".repeat(12))).toBeNull();
  });
});

describe("plans", () => {
  const minerCap = minerCellCapacity(TESTNET, terms);
  const tokenCap = tokenCellCapacity(TESTNET, terms);

  /** A creating ticket as the arm step reads it: any bytes, identified by their hash. */
  const creating = Uint8Array.from([2, 0, 0, 0, 1, 2, 3]);
  const paid = (): MinerCell => ({
    ...sealed(1, minerCap),
    seal: { txid: displayTxid(creating), vout: 1 },
    data: { state: "paid", nonce: 0n, anchor: 0 },
  });

  it("never plan a cell below what it occupies, data included", () => {
    const plans = [
      planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 }),
      planTicket(TESTNET, terms, { idle: miner("idle", minerCap), paymaster: null, tip: terms.h0 }),
      planArm(TESTNET, terms, paid(), creating, terms.h0),
      planMint(TESTNET, terms, { miner: miner("armed", minerCap), held: null, nonce: 1n, reward: 5n }),
      planMint(TESTNET, terms, { miner: miner("armed", minerCap), held: { ...sealed(2, tokenCap), amount: 1n }, nonce: 1n, reward: 5n }),
      planTransfer(TESTNET, terms, { from: [{ ...sealed(2, tokenCap), amount: 9n }], amount: 4n, to: paymaster.address, paymaster }),
    ];
    for (const plan of plans) {
      plan.virtualTx.outputs.forEach((output, i) => {
        const cell = ccc.CellOutput.from(output);
        const data = ccc.bytesFrom(plan.virtualTx.outputsData[i]);
        expect(cell.capacity >= ccc.fixedPointFrom(cell.occupiedSize + data.length)).toBe(true);
      });
    }
    // 8 capacity + RGB++ lock (32+1+36) + xUDT type (32+1+36) + 16 bytes of amount.
    expect(tokenCap).toBe(ccc.fixedPointFrom(8 + 69 + 69 + 16) + CKB_FEE);
  });

  it("a ticket without a miner cell creates it paid, within one paymaster cell, and pays the new-cell split", () => {
    const plan = planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 });
    expect(plan.needPaymasterCell).toBe(true);
    expect(PAYMASTER_CELL > sum(plan.virtualTx.outputs) + MIN_CHANGE).toBe(true);
    expect(plan.cellDeps).toContainEqual(TESTNET.paymasterLockDep);
    const lock = ccc.CellOutput.from(plan.virtualTx.outputs[0]).lock;
    expect(sealFromArgs(lock.args)).toEqual({ txid: PLACEHOLDER_TXID, vout: 1 });
    expect(decodeMinerCell(plan.virtualTx.outputsData[0])).toEqual({ state: "paid", nonce: 0n, anchor: 0 });
    expect(plan.btcOutputs).toEqual([
      { kind: "seal", value: 546 },
      { kind: "ticket", script: terms.promoterScript, value: NEW_CELL.promoter },
      { kind: "fee", address: TESTNET.platformAddress, value: NEW_CELL.platform },
      { kind: "paymaster", address: paymaster.address, value: paymaster.feeSats },
    ]);
    expect(plan.sealsSpent).toEqual([]);
    expect(() => planTicket(TESTNET, terms, { idle: null, paymaster: null, tip: terms.h0 })).toThrow();
  });

  it("a ticket on an idle cell re-arms it at the tip, pays the re-arm split and spends only the CKB fee", () => {
    const plan = planTicket(TESTNET, terms, { idle: miner("idle", minerCap), paymaster: null, tip: terms.h0 + 50 });
    expect(plan.btcOutputs[1]).toMatchObject({ kind: "ticket", value: REUSE.promoter });
    expect(plan.btcOutputs[2]).toEqual({ kind: "fee", address: TESTNET.platformAddress, value: REUSE.platform });
    expect(plan.btcOutputs.some((o) => o.kind === "paymaster")).toBe(false);
    expect(plan.sumInputsCapacity - sum(plan.virtualTx.outputs)).toBe(CKB_FEE);
    expect(decodeMinerCell(plan.virtualTx.outputsData[0])).toMatchObject({ state: "armed", anchor: terms.h0 + 50 });
    expect(plan.cellDeps).not.toContainEqual(TESTNET.paymasterLockDep);
    expect(() => planTicket(TESTNET, terms, { idle: miner("armed", minerCap), paymaster: null, tip: terms.h0 })).toThrow();
    expect(() => planTicket(TESTNET, terms, { idle: miner("idle", minerCap), paymaster: null, tip: terms.h0 - 1 })).toThrow();
  });

  it("arming a paid cell pays nothing and carries the creating ticket past the inputs", () => {
    const plan = planArm(TESTNET, terms, paid(), creating, terms.h0 + 3);
    expect(plan.btcOutputs).toEqual([{ kind: "seal", value: 546 }]);
    expect(plan.btcfunWitness).toBe(ccc.hexFrom(creating));
    expect(decodeMinerCell(plan.virtualTx.outputsData[0])).toEqual({ state: "armed", nonce: 0n, anchor: terms.h0 + 3 });
    const witnesses = virtualResult(plan).ckbRawTx.witnesses;
    expect(witnesses).toEqual(["0xFF", ccc.hexFrom(creating)]);
    // Only the transaction the seal names, and only a paid cell.
    expect(() => planArm(TESTNET, terms, paid(), Uint8Array.from([9]), terms.h0)).toThrow();
    expect(() => planArm(TESTNET, terms, { ...paid(), data: { state: "idle", nonce: 0n, anchor: 0 } }, creating, terms.h0)).toThrow();
  });

  it("a first mint turns the miner cell into the token cell and carries the nonce in the witness", () => {
    const plan = planMint(TESTNET, terms, { miner: miner("armed", minerCap), held: null, nonce: 42n, reward: 25_600_000_000n });
    expect(plan.needPaymasterCell).toBe(false);
    expect(plan.virtualTx.outputs).toHaveLength(1);
    const out = ccc.CellOutput.from(plan.virtualTx.outputs[0]);
    expect(out.type?.eq(tokenScript(TESTNET, mintScript(TESTNET, terms)))).toBe(true);
    expect(out.capacity).toBe(minerCap - CKB_FEE);
    expect(decodeAmount(plan.virtualTx.outputsData[0])).toBe(25_600_000_000n);
    expect(plan.btcfunWitness).toBe(ccc.hexFrom(ccc.numLeToBytes(42n, 8)));
    expect(plan.btcOutputs).toEqual([{ kind: "seal", value: 546 }]);
  });

  it("a later mint returns the cell idle with the nonce, adds to the balance, and pays only the network", () => {
    const held: TokenCell = { ...sealed(2, tokenCap), amount: 1_000n };
    const plan = planMint(TESTNET, terms, { miner: miner("armed", minerCap), held, nonce: 7n, reward: 500n });
    expect(plan.needPaymasterCell).toBe(false);
    expect(plan.btcfunWitness).toBeUndefined();
    expect(plan.sumInputsCapacity - sum(plan.virtualTx.outputs)).toBe(CKB_FEE);
    const [minerVout, tokenVout] = plan.virtualTx.outputs.map((o) => sealFromArgs(ccc.CellOutput.from(o).lock.args).vout);
    expect([minerVout, tokenVout]).toEqual([1, 2]);
    expect(decodeMinerCell(plan.virtualTx.outputsData[0])).toEqual({ state: "idle", nonce: 7n, anchor: terms.h0 });
    expect(decodeAmount(plan.virtualTx.outputsData[1])).toBe(1_500n);
    expect(plan.btcOutputs.map((o) => o.kind)).toEqual(["seal", "seal"]);
  });

  it("refuses a mint of nothing and a mint from a cell without a ticket", () => {
    const base = { miner: miner("armed", minerCap), held: null, nonce: 1n };
    expect(() => planMint(TESTNET, terms, { ...base, reward: 0n })).toThrow();
    expect(() => planMint(TESTNET, terms, { ...base, miner: miner("idle", minerCap), reward: 1n })).toThrow();
    expect(() => planMint(TESTNET, terms, { ...base, miner: miner("paid", minerCap), reward: 1n })).toThrow();
  });

  it("a transfer with change needs capacity for a second cell; a whole-cell transfer does not", () => {
    const from: TokenCell[] = [{ ...sealed(2, tokenCap), amount: 1_000n }];
    const partial = planTransfer(TESTNET, terms, { from, amount: 300n, to: paymaster.address, paymaster });
    expect(partial.needPaymasterCell).toBe(true);
    expect(partial.virtualTx.outputsData.map(decodeAmount)).toEqual([300n, 700n]);
    expect(partial.btcOutputs[0]).toMatchObject({ kind: "payment", address: paymaster.address });

    const whole = planTransfer(TESTNET, terms, { from, amount: 1_000n, to: paymaster.address, paymaster });
    expect(whole.needPaymasterCell).toBe(false);
    expect(whole.sumInputsCapacity - sum(whole.virtualTx.outputs)).toBe(CKB_FEE);
    expect(() => planTransfer(TESTNET, terms, { from, amount: 1_001n, to: paymaster.address, paymaster })).toThrow();
  });

  it("sends the queue each dependency with its own type, the paymaster's lock group included", () => {
    const deps = virtualResult(planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 })).ckbRawTx.cellDeps;
    expect(deps).toContainEqual({
      outPoint: { txHash: TESTNET.paymasterLockDep.outPoint.txHash, index: "0x0" },
      depType: "depGroup",
    });
    expect(deps.filter((d) => d.depType === "code")).toHaveLength(deps.length - 1);
  });
});

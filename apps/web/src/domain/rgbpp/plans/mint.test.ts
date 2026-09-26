import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import { miner, minerCap, sealed, sum, terms, tokenCap } from "@/test/rgbpp";
import { CKB_FEE } from "../cells/capacity";
import { decodeMinerCell } from "../cells/miner";
import { decodeAmount, type TokenCell } from "../cells/token";
import { TESTNET } from "../config";
import { mintScript, tokenScript } from "../launch";
import { sealFromArgs } from "../seal";
import { planMint } from "./mint";

describe("mint plans", () => {
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
});

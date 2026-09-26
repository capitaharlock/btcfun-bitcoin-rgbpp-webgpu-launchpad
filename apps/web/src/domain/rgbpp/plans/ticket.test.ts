import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import { MIN_CHANGE, miner, minerCap, PAYMASTER_CELL, paymaster, sum, terms } from "@/test/rgbpp";
import { NEW_CELL, REUSE } from "@/domain/protocol";
import { CKB_FEE } from "../cells/capacity";
import { decodeMinerCell } from "../cells/miner";
import { TESTNET } from "../config";
import { PLACEHOLDER_TXID, sealFromArgs } from "../seal";
import { planTicket } from "./ticket";

describe("ticket plans", () => {
  it("a ticket without a miner cell creates it paid, within one paymaster cell, and pays the new-cell split", () => {
    const plan = planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 });
    expect(plan.needPaymasterCell).toBe(true);
    expect(PAYMASTER_CELL > sum(plan.virtualTx.outputs) + MIN_CHANGE).toBe(true);
    expect(plan.cellDeps).toContainEqual(TESTNET.paymasterLockDep);
    const lock = ccc.CellOutput.from(plan.virtualTx.outputs[0]).lock;
    expect(sealFromArgs(lock.args)).toEqual({ txid: PLACEHOLDER_TXID, vout: 1 });
    expect(decodeMinerCell(plan.virtualTx.outputsData[0])).toEqual({ state: "paid", nonce: 0n, anchor: terms.h0 });
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
});

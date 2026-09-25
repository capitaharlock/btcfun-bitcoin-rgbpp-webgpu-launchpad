import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import { ADMISSION, creating, miner, minerCap, paid, paymaster, sealed, terms, tokenCap } from "../../../test/rgbpp";
import { CKB_FEE } from "../cells/capacity";
import { TESTNET } from "../config";
import { virtualResult } from "../service";
import { planArm } from "./arm";
import { planMint } from "./mint";
import { planTicket } from "./ticket";
import { planTransfer } from "./transfer";

describe("plans", () => {
  it("never plan a cell below what it occupies, data included", () => {
    const plans = [
      planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 }),
      planTicket(TESTNET, terms, { idle: miner("idle", minerCap), paymaster: null, tip: terms.h0 }),
      planArm(TESTNET, terms, paid(), creating, terms.h0, ADMISSION),
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

  it("sends the queue each dependency with its own type, the paymaster's lock group included", () => {
    const deps = virtualResult(planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 })).ckbRawTx.cellDeps;
    expect(deps).toContainEqual({
      outPoint: { txHash: TESTNET.paymasterLockDep.outPoint.txHash, index: "0x0" },
      depType: "depGroup",
    });
    expect(deps.filter((d) => d.depType === "code")).toHaveLength(deps.length - 1);
  });
});

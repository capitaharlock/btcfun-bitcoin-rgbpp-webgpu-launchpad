import { describe, expect, it } from "vitest";

import { paymaster, sealed, sum, terms, tokenCap } from "@/test/rgbpp";
import { CKB_FEE } from "../cells/capacity";
import { decodeAmount, type TokenCell } from "../cells/token";
import { TESTNET } from "../config";
import { planTransfer } from "./transfer";

describe("transfer plans", () => {
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
});

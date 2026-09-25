import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import { ADMISSION, creating, paid, terms } from "../../../test/rgbpp";
import { displayTxid } from "../../bitcoin/txid";
import { ANCHOR_GRACE_BLOCKS } from "../../standard";
import { decodeMinerCell } from "../cells/miner";
import { TESTNET } from "../config";
import { virtualResult } from "../service";
import { ARM_ANCHOR_MARGIN, armAnchor, planArm } from "./arm";

describe("arm plans", () => {
  it("arming a paid cell pays nothing and carries the creating ticket past the inputs", () => {
    const plan = planArm(TESTNET, terms, paid(), creating, terms.h0 + 3, ADMISSION);
    expect(plan.btcOutputs).toEqual([{ kind: "seal", value: 546 }]);
    expect(plan.btcfunWitness).toBe(ccc.hexFrom(ccc.bytesConcat(ADMISSION, creating)));
    // Armed naming its ticket, whose output stays the challenge; a paid cell
    // with no usable anchor is anchored at the tip.
    expect(decodeMinerCell(plan.virtualTx.outputsData[0])).toEqual({ state: "armed", nonce: 0n, anchor: terms.h0 + 3, ticket: displayTxid(creating) });
    const fresh = planArm(TESTNET, terms, { ...paid(), data: { state: "paid", nonce: 0n, anchor: terms.h0 + 1 } }, creating, terms.h0 + 20, ADMISSION);
    expect(decodeMinerCell(fresh.virtualTx.outputsData[0])?.anchor).toBe(terms.h0 + 1);
    expect(armAnchor(terms.h0 + 1, terms.h0, terms.h0 + 1 + ANCHOR_GRACE_BLOCKS - ARM_ANCHOR_MARGIN)).toBe(terms.h0 + 1);
    expect(armAnchor(terms.h0 + 1, terms.h0, terms.h0 + 2 + ANCHOR_GRACE_BLOCKS - ARM_ANCHOR_MARGIN)).toBe(terms.h0 + 2 + ANCHOR_GRACE_BLOCKS - ARM_ANCHOR_MARGIN);
    const witnesses = virtualResult(plan).ckbRawTx.witnesses;
    expect(witnesses).toEqual(["0xFF", ccc.hexFrom(ccc.bytesConcat(ADMISSION, creating))]);
    // Only the transaction the seal names, and only a paid cell.
    expect(() => planArm(TESTNET, terms, paid(), Uint8Array.from([9]), terms.h0, ADMISSION)).toThrow();
    expect(() => planArm(TESTNET, terms, { ...paid(), data: { state: "idle", nonce: 0n, anchor: 0 } }, creating, terms.h0, ADMISSION)).toThrow();
  });
});

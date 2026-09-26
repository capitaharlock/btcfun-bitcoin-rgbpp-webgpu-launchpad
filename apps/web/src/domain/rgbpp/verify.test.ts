import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import vectors from "../../../../../contracts/vectors/reward.json";
import { reward } from "@/domain/protocol";
import { TESTNET } from "./config";
import { metadataHash, mintScript, type LaunchTerms } from "./launch";
import { encodeAmount } from "./cells/token";
import { encodeMinerCell } from "./cells/miner";
import { minerCellCapacity, tokenCellCapacity } from "./cells/capacity";
import { planMint } from "./plans/mint";
import { rgbppLock } from "./seal";
import { verifyMint } from "./verify";

// A ticket from the shared vectors, with a nonce known to reach its clz.
const ticket = vectors.challenge[0];
const terms: LaunchTerms = {
  h0: 4_800_000,
  metadataHash: metadataHash({ name: "Mesh", symbol: "MESH", description: "", imageHash: "" }),
  promoterScript: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0xaa)]),
};
const anchor = terms.h0 + 10;
const btcTxid = "99".repeat(32);

/** A mint as it lands: the plan, with the real txid written into its seals. */
function landedMint(claimed: bigint, nonce = BigInt(ticket.nonce)) {
  const miner = {
    outPoint: { txHash: "0x" + "12".repeat(32), index: 0 },
    capacity: minerCellCapacity(TESTNET, terms),
    seal: { txid: ticket.txid, vout: ticket.vout },
    data: { state: "armed" as const, nonce: 0n, anchor },
  };
  const plan = planMint(TESTNET, terms, { miner, held: null, nonce, reward: 1n });
  // Overwrite the claimed amount, as a cheating author would.
  plan.virtualTx.outputsData[0] = encodeAmount(claimed);
  const withTxid = plan.virtualTx.outputs.map((o) => {
    const cell = ccc.CellOutput.from(o);
    const vout = Number(ccc.numLeFromBytes(ccc.bytesFrom(cell.lock.args).slice(0, 4)));
    return ccc.CellOutput.from({ capacity: cell.capacity, lock: rgbppLock(TESTNET, { txid: btcTxid, vout }), type: cell.type });
  });
  const ckbTx = ccc.Transaction.from({
    inputs: [{ previousOutput: miner.outPoint }],
    outputs: withTxid,
    outputsData: plan.virtualTx.outputsData,
    // The queue fills the input's witness; the nonce rides past it, as signed.
    witnesses: ["0x", plan.btcfunWitness!],
  });
  const committed = (() => {
    const { commitment } = planMint(TESTNET, terms, { miner, held: null, nonce, reward: 1n });
    return commitment;
  })();
  return {
    evidence: {
      btcTxid,
      btcOutputs: ["6a20" + committed.slice(2), "0014" + "bb".repeat(20)],
      ckbTx,
      inputs: [
        {
          output: ccc.CellOutput.from({ capacity: miner.capacity, lock: rgbppLock(TESTNET, miner.seal), type: mintScript(TESTNET, terms) }),
          data: encodeMinerCell(miner.data),
        },
      ],
    },
  };
}

describe("verifying a mint from chain data", () => {
  const expected = reward(ticket.clz, terms.h0, anchor);

  it("finds every rule satisfied for an honest mint", () => {
    // The commitment in this fixture covers a claimed amount of 1, so build
    // the honest one with the real reward throughout.
    const miner = {
      outPoint: { txHash: "0x" + "12".repeat(32), index: 0 },
      capacity: minerCellCapacity(TESTNET, terms),
      seal: { txid: ticket.txid, vout: ticket.vout },
      data: { state: "armed" as const, nonce: 0n, anchor },
    };
    const plan = planMint(TESTNET, terms, { miner, held: null, nonce: BigInt(ticket.nonce), reward: expected });
    const ckbTx = ccc.Transaction.from({
      inputs: [{ previousOutput: miner.outPoint }],
      outputs: plan.virtualTx.outputs.map((o) => {
        const cell = ccc.CellOutput.from(o);
        const vout = Number(ccc.numLeFromBytes(ccc.bytesFrom(cell.lock.args).slice(0, 4)));
        return ccc.CellOutput.from({ capacity: cell.capacity, lock: rgbppLock(TESTNET, { txid: btcTxid, vout }), type: cell.type });
      }),
      outputsData: plan.virtualTx.outputsData,
      witnesses: ["0x", plan.btcfunWitness!],
    });
    const verdict = verifyMint(TESTNET, {
      btcTxid,
      btcOutputs: ["6a20" + plan.commitment.slice(2)],
      ckbTx,
      inputs: [{
        output: ccc.CellOutput.from({ capacity: miner.capacity, lock: rgbppLock(TESTNET, miner.seal), type: mintScript(TESTNET, terms) }),
        data: encodeMinerCell(miner.data),
      }],
    });
    expect(verdict.checks.filter((c) => !c.ok)).toEqual([]);
    expect(verdict.minted).toBe(expected);
    expect(tokenCellCapacity(TESTNET, terms) > 0n).toBe(true);
  });

  it("flags an inflated amount, and a commitment that does not match", () => {
    const { evidence } = landedMint(expected + 1n);
    const verdict = verifyMint(TESTNET, evidence);
    expect(verdict.valid).toBe(false);
    expect(verdict.checks.find((c) => c.label === "amount")?.ok).toBe(false);
    expect(verdict.checks.find((c) => c.label === "commitment")?.ok).toBe(false);
  });

  it("flags work that falls short", () => {
    const { evidence } = landedMint(1n, 0n);
    const verdict = verifyMint(TESTNET, evidence);
    expect(verdict.checks.find((c) => c.label === "proof of work")?.ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { deriveKey } from "@/domain/bitcoin";
import { TESTNET3 } from "@/domain/bitcoin";
import { InsufficientFunds } from "@/domain/bitcoin";
import type { Utxo } from "@/domain/bitcoin";
import { ARM_SHAPE, fundingNeeded, mintShape, networkFee, plainFunding, shapeOf, signOperation, strippedTx } from "./transaction";
import { TESTNET } from "./config";
import { metadataHash, type LaunchTerms } from "./launch";
import { displayTxid } from "@/domain/bitcoin";
import { planArm } from "./plans/arm";
import { planMint } from "./plans/mint";
import { planTicket } from "./plans/ticket";
import { SEAL_SATS } from "./plans/plan";
import type { MinerCell } from "./cells/miner";
import { NEW_CELL, REUSE } from "@/domain/protocol";

const key = deriveKey(new Uint8Array(32).fill(7), TESTNET3);
const terms: LaunchTerms = {
  h0: 4_800_000,
  metadataHash: metadataHash({ name: "Mesh", symbol: "MESH", description: "", imageHash: "" }),
  promoterScript: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0xaa)]),
};
/** Any 96 bytes: plans carry the admission, the script checks it. */
const ADMISSION = new Uint8Array(96).fill(3);
const paymaster = { address: "tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj", feeSats: 7000 };
const idle: MinerCell = {
  outPoint: { txHash: "0x" + "12".repeat(32), index: 0 },
  capacity: 50_000_000_000n,
  seal: { txid: "34".repeat(32), vout: 1 },
  data: { state: "idle", nonce: 0n, anchor: 0 },
};
const sealUtxo: Utxo = { txid: idle.seal.txid, vout: idle.seal.vout, value: SEAL_SATS, confirmed: true };
const coin = (value: number, n = 0): Utxo => ({ txid: String(n).padStart(64, "5"), vout: 0, value, confirmed: true });

describe("funding an operation", () => {
  it("takes only confirmed plain coins, never a seal or an output still landing", () => {
    const landing = coin(9_000, 3);
    const utxos = [coin(20_000, 1), { ...coin(8_000, 2), confirmed: false }, sealUtxo, landing];
    expect(plainFunding(utxos, new Set([landing.txid]))).toEqual([coin(20_000, 1)]);
  });

  const armed: MinerCell = { ...idle, data: { state: "armed", nonce: 0n, anchor: terms.h0 } };
  const held = { outPoint: { txHash: "0x" + "56".repeat(32), index: 0 }, capacity: 20_000_000_000n, seal: { txid: "78".repeat(32), vout: 2 }, amount: 5n };
  const heldUtxo: Utxo = { txid: held.seal.txid, vout: 2, value: SEAL_SATS, confirmed: true };
  const creating = Uint8Array.from([1, 2, 3]);
  const paid: MinerCell = { ...idle, seal: { txid: displayTxid(creating), vout: 1 }, data: { state: "paid", nonce: 0n, anchor: 0 } };
  const paidUtxo: Utxo = { txid: paid.seal.txid, vout: 1, value: SEAL_SATS, confirmed: true };

  for (const [name, plan, sealed] of [
    ["a re-arming ticket", planTicket(TESTNET, terms, { idle, paymaster: null, tip: terms.h0 }), [sealUtxo]],
    ["a ticket that creates its cell", planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 }), []],
    ["an arming", planArm(TESTNET, terms, paid, creating, terms.h0, ADMISSION), [paidUtxo]],
    ["a first mint", planMint(TESTNET, terms, { miner: armed, held: null, nonce: 1n, reward: 1n }), [sealUtxo]],
    ["a later mint", planMint(TESTNET, terms, { miner: armed, held, nonce: 1n, reward: 1n }), [sealUtxo, heldUtxo]],
  ] as const) {
    it(`estimates exactly what signing ${name} takes from one coin`, () => {
      for (const feeRate of [1, 3, 12]) {
        const needed = fundingNeeded(plan, feeRate, TESTNET3);
        expect(() => signOperation(key, plan, sealed, [coin(needed)], feeRate, TESTNET3)).not.toThrow();
        expect(() => signOperation(key, plan, sealed, [coin(needed - 1)], feeRate, TESTNET3)).toThrow(InsufficientFunds);
      }
    });
  }

  it("sizes an arming and a mint before they exist, by the rule that signs them", () => {
    const arm = planArm(TESTNET, terms, paid, creating, terms.h0, ADMISSION);
    const first = planMint(TESTNET, terms, { miner: armed, held: null, nonce: 1n, reward: 1n });
    const later = planMint(TESTNET, terms, { miner: armed, held, nonce: 1n, reward: 1n });
    for (const rate of [3, 17]) {
      expect(fundingNeeded(ARM_SHAPE, rate, TESTNET3)).toBe(fundingNeeded(arm, rate, TESTNET3));
      expect(fundingNeeded(mintShape(false), rate, TESTNET3)).toBe(fundingNeeded(first, rate, TESTNET3));
      expect(fundingNeeded(mintShape(true), rate, TESTNET3)).toBe(fundingNeeded(later, rate, TESTNET3));
      expect(fundingNeeded(shapeOf(later), rate, TESTNET3)).toBe(fundingNeeded(later, rate, TESTNET3));
    }
    // A mint pays the network and nothing else: its seals come back.
    expect(fundingNeeded(mintShape(true), 3, TESTNET3)).toBe(networkFee(mintShape(true), 3, TESTNET3));
  });

  it("prices each ticket at its split plus the network, less the seal it spends", () => {
    const rearm = planTicket(TESTNET, terms, { idle, paymaster: null, tip: terms.h0 });
    const create = planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 });
    expect(fundingNeeded(rearm, 3, TESTNET3)).toBe(REUSE.platform + REUSE.promoter + networkFee(shapeOf(rearm), 3, TESTNET3));
    expect(fundingNeeded(create, 3, TESTNET3)).toBe(
      SEAL_SATS + NEW_CELL.platform + NEW_CELL.promoter + paymaster.feeSats + networkFee(shapeOf(create), 3, TESTNET3),
    );
  });

  it("strips a signed segwit transaction to exactly what its txid hashes", () => {
    const plan = planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 });
    const signed = signOperation(key, plan, [], [coin(60_000)], 3, TESTNET3);
    expect(signed.hex.slice(8, 12)).toBe("0001"); // the segwit marker and flag
    expect(displayTxid(strippedTx(signed.hex))).toBe(signed.txid);
  });
});

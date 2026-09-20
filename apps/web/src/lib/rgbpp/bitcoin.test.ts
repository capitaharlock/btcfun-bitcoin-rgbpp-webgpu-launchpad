import { describe, expect, it } from "vitest";

import { deriveKey } from "../bitcoin/keys";
import { TESTNET3 } from "../bitcoin/network";
import { InsufficientFunds } from "../bitcoin/payment";
import type { Utxo } from "../bitcoin/provider";
import { fundingNeeded, plainFunding, signOperation } from "./bitcoin";
import { TESTNET } from "./config";
import { metadataHash, type LaunchTerms } from "./launch";
import { planOpen, planTicket, SEAL_SATS, type MinerCell } from "./operations";

const key = deriveKey(new Uint8Array(32).fill(7), TESTNET3);
const terms: LaunchTerms = {
  h0: 4_800_000,
  metadataHash: metadataHash({ name: "Mesh", symbol: "MESH", description: "", imageHash: "" }),
  promoterScript: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0xaa)]),
};
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

  for (const [name, plan, sealed] of [
    ["a ticket", planTicket(TESTNET, terms, idle, terms.h0), [sealUtxo]],
    ["an opening", planOpen(TESTNET, terms, paymaster), []],
  ] as const) {
    it(`estimates exactly what signing ${name} takes from one coin`, () => {
      for (const feeRate of [1, 3, 12]) {
        const needed = fundingNeeded(plan, feeRate, TESTNET3);
        expect(() => signOperation(key, plan, sealed, [coin(needed)], feeRate, TESTNET3)).not.toThrow();
        expect(() => signOperation(key, plan, sealed, [coin(needed - 1)], feeRate, TESTNET3)).toThrow(InsufficientFunds);
      }
    });
  }

  it("prices a ticket at its two payments plus the fee, less the seal it spends", () => {
    const needed = fundingNeeded(planTicket(TESTNET, terms, idle, terms.h0), 1, TESTNET3);
    // outputs: seal 546 + promoter 9,500 + platform 500; the idle cell's seal brings 546 back.
    expect(needed).toBeGreaterThan(10_000);
    expect(needed).toBeLessThan(10_000 + 400);
  });
});

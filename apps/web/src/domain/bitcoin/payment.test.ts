import { describe, expect, it } from "vitest";
import { Transaction } from "@scure/btc-signer";

import { buildPayment } from "./payment";
import { estimateVsize, MAX_MEMO_BYTES, opReturnScriptBytes, P2WPKH_SCRIPT_BYTES } from "./size";
import { DUST_SATS } from "./network";
import { deriveKey } from "./keys";
import { hexToBytes } from "@/domain/codec";
import type { Utxo } from "./types";

/** A second testnet address, derived the same way, to pay into. */
const RECIPIENT = deriveKey(new Uint8Array(32).fill(4)).address;

function utxo(value: number, n = 0): Utxo {
  return { txid: String(n).padStart(64, "0"), vout: n, value, confirmed: true };
}

const FEE_RATE = 2;
const P2WPKH = P2WPKH_SCRIPT_BYTES;

describe("buildPayment", () => {
  const key = deriveKey(new Uint8Array(32).fill(9));
  const funding: Utxo[] = [utxo(200_000, 1), utxo(50_000, 2)];

  it("produces a transaction that parses back to what was selected", () => {
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: 120_000,
      feeRate: 3,
      utxos: funding,
    });

    const tx = Transaction.fromRaw(hexToBytes(signed.hex));
    expect(tx.inputsLength).toBe(signed.selection.inputs.length);
    expect(tx.outputsLength).toBe(signed.selection.change > 0 ? 2 : 1);
    expect(tx.id).toBe(signed.txid);
    expect(tx.getOutput(0).amount).toBe(120_000n);
  });

  it("signs and finalises every input it spends", () => {
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: 220_000,
      feeRate: 2,
      utxos: funding,
    });
    const tx = Transaction.fromRaw(hexToBytes(signed.hex));
    expect(tx.inputsLength).toBe(2);
    for (let i = 0; i < tx.inputsLength; i++) {
      // A finalised P2WPKH input carries <signature> <pubkey> and an empty
      // scriptSig. Without both, a node rejects the transaction outright.
      const input = tx.getInput(i);
      expect(input.finalScriptWitness).toBeDefined();
      expect(input.finalScriptWitness).toHaveLength(2);
      expect(input.finalScriptWitness?.[1]).toEqual(key.publicKey);
    }
  });

  it("returns change to the sender's own address", () => {
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: 50_000,
      feeRate: 2,
      utxos: funding,
    });
    expect(signed.selection.change).toBeGreaterThan(0);
    const tx = Transaction.fromRaw(hexToBytes(signed.hex));
    expect(tx.getOutput(1).script).toEqual(key.script);
  });

  it("commits a memo in an OP_RETURN output", () => {
    const memo = new TextEncoder().encode("btcfun:t1:mesh:7:02ab");
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: 50_000,
      feeRate: 2,
      utxos: funding,
      memo,
    });
    const tx = Transaction.fromRaw(hexToBytes(signed.hex), { allowUnknownOutputs: true });
    const opReturn = tx.getOutput(tx.outputsLength - 1);
    expect(opReturn.amount).toBe(0n);
    expect(opReturn.script?.[0]).toBe(0x6a);
    expect(opReturn.script?.slice(2)).toEqual(memo);
  });

  /* Regression. Before the fix this produced 141 sats over a 233 vB
   * transaction — 0.605 sat/vB against a requested 1. */
  it("pays the requested rate over the size a node will measure", () => {
    for (const memoLength of [0, 1, 40, 75, 76, 80]) {
      for (const feeRate of [1, 2, 11]) {
        const signed = buildPayment(key, {
          to: RECIPIENT,
          amountSats: 50_000,
          feeRate,
          utxos: funding,
          ...(memoLength > 0 ? { memo: new Uint8Array(memoLength).fill(7) } : {}),
        });
        const tx = Transaction.fromRaw(hexToBytes(signed.hex), { allowUnknownOutputs: true });
        expect(signed.vsize).toBe(tx.vsize);
        expect(signed.selection.fee / tx.vsize).toBeGreaterThanOrEqual(feeRate);
        // Never wildly over, either: the estimate is tight to within a byte of
        // signature per input.
        expect(signed.selection.vsize - tx.vsize).toBeLessThanOrEqual(2);
      }
    }
  });

  it("pays the requested rate when the change output is dropped", () => {
    const memo = new Uint8Array(MAX_MEMO_BYTES).fill(3);
    const value = 100_000;
    const vsize = estimateVsize(1, [P2WPKH, P2WPKH, opReturnScriptBytes(MAX_MEMO_BYTES)]);
    const amount = value - vsize * FEE_RATE - (DUST_SATS - 1);
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: amount,
      feeRate: FEE_RATE,
      utxos: [utxo(value, 5)],
      memo,
    });
    expect(signed.selection.change).toBe(0);
    const tx = Transaction.fromRaw(hexToBytes(signed.hex), { allowUnknownOutputs: true });
    expect(signed.selection.fee / tx.vsize).toBeGreaterThanOrEqual(FEE_RATE);
  });

  it("refuses a memo the network would not relay", () => {
    expect(() =>
      buildPayment(key, {
        to: RECIPIENT,
        amountSats: 50_000,
        feeRate: 2,
        utxos: funding,
        memo: new Uint8Array(MAX_MEMO_BYTES + 1),
      }),
    ).toThrow(RangeError);
  });

  /* Captured from the builder before coin selection moved to `coins.ts`:
   * signatures are deterministic (RFC 6979), so the same inputs must give
   * the same bytes, change output and all. */
  it("builds the same bytes it always did", () => {
    const build = (amountSats: number, feeRate: number, utxos: Utxo[], memo?: Uint8Array) =>
      buildPayment(key, { to: RECIPIENT, amountSats, feeRate, utxos, ...(memo ? { memo } : {}) }).hex;
    expect(build(120_000, 3, funding)).toBe(
      "0200000000010101000000000000000000000000000000000000000000000000000000000000000100000000ffffffff02c0d4010000000000160014111533ea42a4732c38eca9a3336b4f66bc67f1bbd9360100000000001600148617baee59b13bb164d756bc1cf319c800c14fdd02483045022100beecfd074e59c3cb8c7e67d6e9aa3eb7a554d7b2826204830f678d44fe14b82b02203de16b5384a166130c2c819b6487d9319df61d287e5789dfd682e33efb88a4d601210341bdc80868f66e88187e86a9134e543cd02af98ea71b4b360f5d61257db0e69800000000",
    );
    expect(build(220_000, 2, funding, new TextEncoder().encode("btcfun:t1:mesh:7:02ab"))).toBe(
      "0200000000010201000000000000000000000000000000000000000000000000000000000000000100000000ffffffff02000000000000000000000000000000000000000000000000000000000000000200000000ffffffff03605b030000000000160014111533ea42a4732c38eca9a3336b4f66bc67f1bb4e730000000000001600148617baee59b13bb164d756bc1cf319c800c14fdd0000000000000000176a1562746366756e3a74313a6d6573683a373a303261620247304402206b9855d5fefc3063842c1906b0f13aac44141f22208eb048d175daad40bfc3f3022009e5eba40388979ff55f259f25ef17ca918e476d190711e43ce0118b11478e5a01210341bdc80868f66e88187e86a9134e543cd02af98ea71b4b360f5d61257db0e69802473044022043ba5206d3b84dcb43b5883fca41ab73aa6823a5b37238f8bb24fac2d883e24f02202838a260e7a39630defc8a1bcd5176cd2f60e88ae8ff8331136105c6bceccb8401210341bdc80868f66e88187e86a9134e543cd02af98ea71b4b360f5d61257db0e69800000000",
    );
    // Change would be 545 sats: dropped, and paid to the miner instead.
    expect(build(100_000 - 141 * 2 - 545, 2, [utxo(100_000, 5)])).toBe(
      "0200000000010105000000000000000000000000000000000000000000000000000000000000000500000000ffffffff026583010000000000160014111533ea42a4732c38eca9a3336b4f66bc67f1bb21020000000000001600148617baee59b13bb164d756bc1cf319c800c14fdd02473044022072fd053bff844631b9cdcbd7563932986f5f77d1e585715ff5ac98a578d235b602207ab016180ad645f3d92f891da1781a3cb7b0704121e36873103a7ab48f8942c801210341bdc80868f66e88187e86a9134e543cd02af98ea71b4b360f5d61257db0e69800000000",
    );
  });
});

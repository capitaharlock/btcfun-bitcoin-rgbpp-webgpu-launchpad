import { describe, expect, it } from "vitest";
import { Transaction } from "@scure/btc-signer";

import { FeeTooLow, InsufficientFunds, MAX_MEMO_BYTES, P2WPKH_SCRIPT_BYTES, buildPayment, estimateVsize, opReturnScriptBytes, selectCoins } from "./payment";
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
const PAY = [P2WPKH];

function select(utxos: Utxo[], amount: number, feeRate = FEE_RATE, outputScripts = PAY) {
  return selectCoins({ utxos, amount, feeRate, outputScripts });
}

describe("estimateVsize", () => {
  it("matches the consensus size of a one-in two-out P2WPKH spend", () => {
    // base 113 B × 4 + witness 110 WU = 562 WU → 141 vB.
    expect(estimateVsize(1, [P2WPKH, P2WPKH])).toBe(141);
  });

  it("grows by an input and by an output", () => {
    expect(estimateVsize(2, [P2WPKH, P2WPKH]) - estimateVsize(1, [P2WPKH, P2WPKH])).toBe(68);
    expect(
      estimateVsize(1, [P2WPKH, P2WPKH, P2WPKH]) - estimateVsize(1, [P2WPKH, P2WPKH]),
    ).toBe(31);
  });

  it("charges an OP_RETURN for the bytes it occupies", () => {
    // An 80-byte memo is a 92 vB output, not a 31 vB one.
    const memo = opReturnScriptBytes(MAX_MEMO_BYTES);
    expect(memo).toBe(83);
    expect(estimateVsize(1, [P2WPKH, P2WPKH, memo])).toBe(233);
  });

  it("prices every push encoding an OP_RETURN can take", () => {
    expect(opReturnScriptBytes(0)).toBe(2);
    expect(opReturnScriptBytes(75)).toBe(77);
    expect(opReturnScriptBytes(76)).toBe(79); // PUSHDATA1 costs an extra byte
    expect(opReturnScriptBytes(80)).toBe(83);
  });
});

describe("selectCoins", () => {
  it("uses one input when one suffices", () => {
    const s = select([utxo(100_000)], 50_000);
    expect(s.inputs).toHaveLength(1);
    expect(s.amount).toBe(50_000);
    expect(s.change).toBeGreaterThan(0);
  });

  it("always conserves value: inputs = amount + change + fee", () => {
    const utxos = [utxo(90_000, 1), utxo(40_000, 2), utxo(7_000, 3)];
    for (const amount of [1_000, 50_000, 95_000, 120_000]) {
      const s = select(utxos, amount);
      const gathered = s.inputs.reduce((sum, u) => sum + u.value, 0);
      expect(s.amount + s.change + s.fee).toBe(gathered);
    }
  });

  it("pays at least the fee its own size demands, memo or not", () => {
    const utxos = [utxo(90_000, 1), utxo(40_000, 2)];
    const shapes = [PAY, [...PAY, opReturnScriptBytes(MAX_MEMO_BYTES)]];
    for (const outputs of shapes) {
      for (const amount of [1_000, 60_000, 100_000]) {
        const s = select(utxos, amount, FEE_RATE, outputs);
        expect(s.fee).toBeGreaterThanOrEqual(Math.ceil(s.vsize * FEE_RATE));
        expect(s.feeRate).toBeGreaterThanOrEqual(FEE_RATE);
      }
    }
  });

  it("adds inputs until the fee for those inputs is covered", () => {
    const s = select([utxo(50_000, 1), utxo(50_000, 2)], 60_000);
    expect(s.inputs).toHaveLength(2);
  });

  it("drops a dust change output and gives the remainder to the miner", () => {
    const value = 100_000;
    const feeWithChange = Math.ceil(estimateVsize(1, [P2WPKH, P2WPKH]) * FEE_RATE);
    const amount = value - feeWithChange - (DUST_SATS - 1);
    const s = select([utxo(value)], amount);
    expect(s.change).toBe(0);
    expect(s.fee).toBe(value - amount);
    expect(s.vsize).toBe(estimateVsize(1, [P2WPKH]));
  });

  it("spends the largest UTXOs first", () => {
    const s = select([utxo(90_000, 1), utxo(10_000, 2)], 5_000);
    expect(s.inputs[0].value).toBe(90_000);
    expect(s.inputs).toHaveLength(1);
  });

  it("reports what was missing when funds fall short", () => {
    try {
      select([utxo(10_000)], 50_000);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientFunds);
      expect((err as InsufficientFunds).available).toBe(10_000);
      expect((err as InsufficientFunds).required).toBeGreaterThan(50_000);
    }
  });

  it("refuses amounts below the dust limit and rates at or below zero", () => {
    expect(() => select([utxo(100_000)], DUST_SATS - 1)).toThrow(RangeError);
    expect(() => select([utxo(100_000)], 0)).toThrow(RangeError);
    expect(() => select([utxo(100_000)], 50_000, 0)).toThrow(RangeError);
  });

  it("charges more at a higher fee rate", () => {
    const cheap = select([utxo(100_000)], 50_000, 1);
    const dear = select([utxo(100_000)], 50_000, 20);
    expect(dear.fee).toBeGreaterThan(cheap.fee);
    expect(dear.change).toBeLessThan(cheap.change);
  });
});

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

  it("exports FeeTooLow so an estimator regression is catchable", () => {
    expect(new FeeTooLow(141, 233, 1).name).toBe("FeeTooLow");
  });
});

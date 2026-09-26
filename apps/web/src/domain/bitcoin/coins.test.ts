import { describe, expect, it } from "vitest";

import { FeeTooLow, InsufficientFunds, assertFeeCovers, selectCoins, type SelectionRequest } from "./coins";
import { DUST_SATS } from "./network";
import { MAX_MEMO_BYTES, P2WPKH_SCRIPT_BYTES, estimateVsize, opReturnScriptBytes } from "./size";
import type { Utxo } from "./types";

function utxo(value: number, n = 0): Utxo {
  return { txid: String(n).padStart(64, "0"), vout: n, value, confirmed: true };
}

const FEE_RATE = 2;
const P2WPKH = P2WPKH_SCRIPT_BYTES;
const PAY = [P2WPKH];
/** An RGB++ operation: a 34-byte commitment and one seal. */
const OPERATION = [34, P2WPKH];

function select(utxos: Utxo[], amount: number, feeRate = FEE_RATE, outputScripts = PAY) {
  return selectCoins({ utxos, amount, feeRate, outputScripts });
}

function feeFor(inputs: number, outputs: readonly number[], feeRate = FEE_RATE): number {
  return Math.ceil(estimateVsize(inputs, [...outputs, P2WPKH]) * feeRate);
}

function shortfall(request: SelectionRequest): InsufficientFunds {
  try {
    selectCoins(request);
  } catch (err) {
    if (err instanceof InsufficientFunds) return err;
    throw err;
  }
  return expect.unreachable("should have thrown InsufficientFunds");
}

describe("selectCoins for a payment", () => {
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

  it("keeps a change output that clears dust, at the fee for that shape", () => {
    const s = select([utxo(100_000)], 50_000);
    expect(s.fee).toBe(feeFor(1, PAY));
    expect(s.change).toBe(100_000 - 50_000 - s.fee);
    expect(s.vsize).toBe(estimateVsize(1, [P2WPKH, P2WPKH]));
  });

  it("drops a dust change output and gives the remainder to the miner", () => {
    const value = 100_000;
    const amount = value - feeFor(1, PAY) - (DUST_SATS - 1);
    const s = select([utxo(value)], amount);
    expect(s.change).toBe(0);
    expect(s.fee).toBe(value - amount);
    expect(s.vsize).toBe(estimateVsize(1, [P2WPKH]));
    expect(s.feeRate).toBe(s.fee / s.vsize);
  });

  it("spends the coins in the order given, largest first by convention", () => {
    const s = select([utxo(90_000, 1), utxo(10_000, 2)], 5_000);
    expect(s.inputs[0].value).toBe(90_000);
    expect(s.inputs).toHaveLength(1);
  });

  it("reports what was missing when funds fall short", () => {
    const err = shortfall({ utxos: [utxo(10_000)], amount: 50_000, feeRate: FEE_RATE, outputScripts: PAY });
    expect(err.available).toBe(10_000);
    expect(err.required).toBe(50_000 + feeFor(1, PAY));
  });

  it("prices the shortfall for one input when there is no coin at all", () => {
    const err = shortfall({ utxos: [], amount: 50_000, feeRate: FEE_RATE, outputScripts: PAY });
    expect(err.available).toBe(0);
    expect(err.required).toBe(50_000 + feeFor(1, PAY));
  });

  it("refuses amounts below the dust limit and rates at or below zero", () => {
    expect(() => select([utxo(100_000)], DUST_SATS - 1)).toThrow(RangeError);
    expect(() => select([utxo(100_000)], 0)).toThrow(RangeError);
    expect(() => select([utxo(100_000)], 50_000, 0)).toThrow(RangeError);
    expect(() => select([utxo(100_000)], 50_000, FEE_RATE, [])).toThrow(RangeError);
  });

  it("charges more at a higher fee rate", () => {
    const cheap = select([utxo(100_000)], 50_000, 1);
    const dear = select([utxo(100_000)], 50_000, 20);
    expect(dear.fee).toBeGreaterThan(cheap.fee);
    expect(dear.change).toBeLessThan(cheap.change);
  });
});

describe("selectCoins with mandatory inputs", () => {
  const seal = utxo(546, 7);

  it("spends them first and needs no coin when they suffice", () => {
    const big = utxo(20_000, 8);
    const s = selectCoins({ utxos: [utxo(50_000, 1)], amount: 1_000, feeRate: 1, outputScripts: OPERATION, mandatory: [seal, big] });
    expect(s.inputs).toEqual([seal, big]);
    expect(s.fee).toBe(feeFor(2, OPERATION, 1));
    expect(s.change).toBe(20_546 - 1_000 - s.fee);
  });

  it("adds coins after them when they do not", () => {
    const s = selectCoins({ utxos: [utxo(50_000, 1)], amount: 1_000, feeRate: 1, outputScripts: OPERATION, mandatory: [seal] });
    expect(s.inputs.map((u) => u.vout)).toEqual([7, 1]);
    expect(s.fee).toBe(feeFor(2, OPERATION, 1));
    expect(s.change).toBe(50_546 - 1_000 - s.fee);
  });

  it("counts them in what was available when funds fall short", () => {
    const err = shortfall({ utxos: [utxo(500, 1)], amount: 5_000, feeRate: 1, outputScripts: OPERATION, mandatory: [seal] });
    expect(err.available).toBe(1_046);
    expect(err.required).toBe(5_000 + feeFor(2, OPERATION, 1));
  });
});

describe("selectCoins with foreign inputs", () => {
  /** A purchase: the price, a commitment and the buyer's seal. */
  const PURCHASE = [P2WPKH, 34, P2WPKH];
  const foreign = { count: 1, value: 546 };

  it("counts their value and their size but never signs them", () => {
    const s = selectCoins({ utxos: [utxo(100_000, 1)], amount: 30_546, feeRate: FEE_RATE, outputScripts: PURCHASE, foreign });
    expect(s.inputs).toEqual([utxo(100_000, 1)]);
    expect(s.fee).toBe(feeFor(2, PURCHASE));
    expect(s.vsize).toBe(estimateVsize(2, [...PURCHASE, P2WPKH]));
    expect(s.change).toBe(100_546 - 30_546 - s.fee);
  });

  it("still spends one coin of its own when the foreign value alone would do", () => {
    const s = selectCoins({ utxos: [utxo(1_000, 1)], amount: 1_000, feeRate: 1, outputScripts: PURCHASE, foreign: { count: 1, value: 50_000 } });
    expect(s.inputs).toHaveLength(1);
  });

  it("prices the shortfall over the inputs it already has", () => {
    const err = shortfall({ utxos: [], amount: 30_546, feeRate: FEE_RATE, outputScripts: PURCHASE, foreign });
    expect(err.available).toBe(546);
    expect(err.required).toBe(30_546 + feeFor(1, PURCHASE));
  });

  it("refuses a count or value that is not a whole non-negative number", () => {
    for (const bad of [{ count: -1, value: 0 }, { count: 1.5, value: 0 }, { count: 1, value: -5 }, { count: 1, value: Number.NaN }]) {
      expect(() => selectCoins({ utxos: [utxo(100_000)], amount: 1_000, feeRate: 1, outputScripts: PURCHASE, foreign: bad })).toThrow(RangeError);
    }
  });
});

describe("assertFeeCovers", () => {
  it("lets a fee at or above the rate through and names the shortfall otherwise", () => {
    expect(() => assertFeeCovers(282, 141, 2)).not.toThrow();
    expect(() => assertFeeCovers(281, 141, 2)).toThrow(FeeTooLow);
    try {
      assertFeeCovers(141, 233, 1);
    } catch (err) {
      expect(err).toBeInstanceOf(FeeTooLow);
      expect((err as FeeTooLow).name).toBe("FeeTooLow");
      expect((err as FeeTooLow).message).toMatch(/0\.605 sat\/vB/);
    }
  });
});

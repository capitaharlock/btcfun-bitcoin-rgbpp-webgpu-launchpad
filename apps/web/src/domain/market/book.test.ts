import { describe, expect, it } from "vitest";

import { buildBook, compareRate, unitPrice } from "./book";

const TOKEN = 100_000_000n;
const order = (priceSats: number, tokens: number) => ({ priceSats, amount: BigInt(tokens) * TOKEN });

describe("order book", () => {
  it("prices per whole token", () => {
    expect(unitPrice(order(20_000, 100))).toBe(200);
    expect(unitPrice({ priceSats: 546, amount: 1000n * TOKEN })).toBeCloseTo(0.546);
  });

  it("compares rates by cross-multiplication, without rounding", () => {
    // 1/3 and 333,333,333/999,999,999 are the same rate; 1/3 and 333/1000 are not.
    expect(compareRate({ priceSats: 1, amount: 3n }, { priceSats: 333_333_333, amount: 999_999_999n })).toBe(0);
    expect(compareRate({ priceSats: 333, amount: 1000n }, { priceSats: 1, amount: 3n })).toBe(-1);
  });

  it("sorts asks up and bids down, merging only equal rates, with cumulative depth", () => {
    const book = buildBook(
      [order(30_000, 100), order(5_000, 25), order(20_000, 100), order(40_000, 200)],
      [order(15_000, 100), order(18_000, 100), order(22_500, 150)],
    );
    expect(book.asks.map((l) => [l.unitPrice, l.orders, l.amount / TOKEN, l.cumulative / TOKEN])).toEqual([
      [200, 3, 325n, 325n],
      [300, 1, 100n, 425n],
    ]);
    expect(book.asks[0].sats).toBe(65_000);
    expect(book.bids.map((l) => [l.unitPrice, l.orders, l.cumulative / TOKEN])).toEqual([
      [180, 1, 100n],
      [150, 2, 350n],
    ]);
    expect(book.spread).toBe(20);
  });

  it("has no spread with one side empty, and a negative one when crossed", () => {
    expect(buildBook([order(1_000, 10)], []).spread).toBeNull();
    expect(buildBook([], []).asks).toEqual([]);
    expect(buildBook([order(1_000, 10)], [order(2_000, 10)]).spread).toBe(-100);
  });

  it("ignores empty orders", () => {
    expect(buildBook([{ priceSats: 1_000, amount: 0n }], []).asks).toEqual([]);
  });
});

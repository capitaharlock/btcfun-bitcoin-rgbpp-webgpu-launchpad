import { describe, expect, it } from "vitest";

import { fastFrom, MIN_FAST_FEE_RATE } from "./fees";

describe("fastFrom", () => {
  it("pays the quote when it is above the floor, rounded up to a whole sat/vB", () => {
    expect(fastFrom(7)).toBe(7);
    expect(fastFrom(7.2)).toBe(8);
  });

  it("pays the floor when the quote is below it", () => {
    expect(fastFrom(1)).toBe(MIN_FAST_FEE_RATE);
    expect(fastFrom(MIN_FAST_FEE_RATE)).toBe(MIN_FAST_FEE_RATE);
  });

  it("pays the floor when the quote is unusable", () => {
    for (const quote of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) expect(fastFrom(quote)).toBe(MIN_FAST_FEE_RATE);
  });
});

import { describe, expect, it } from "vitest";
import { CANDIDATE, budget, cumulative, maxAtoms, terminalOffset } from "./emission";
import { exp2neg, ONE } from "./fixed";

const M = maxAtoms(CANDIDATE);
const H = CANDIDATE.halfLife;

/** Share of max supply scheduled at offset n, to 6 decimal places. */
function share(n: bigint): number {
  return Number((cumulative(CANDIDATE, n) * 1_000_000n) / M) / 1_000_000;
}

describe("exp2neg", () => {
  it("is exactly 1 at zero", () => {
    expect(exp2neg(0n, H)).toBe(ONE);
  });

  it("halves at each half-life", () => {
    expect(exp2neg(H, H)).toBe(ONE / 2n);
    expect(exp2neg(2n * H, H)).toBe(ONE / 4n);
    expect(exp2neg(3n * H, H)).toBe(ONE / 8n);
  });

  it("is monotone non-increasing", () => {
    let prev = ONE;
    for (let n = 0n; n < 4000n; n += 37n) {
      const v = exp2neg(n, H);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("cumulative schedule A(n)", () => {
  it("starts at zero and never exceeds max supply", () => {
    expect(cumulative(CANDIDATE, 0n)).toBe(0n);
    expect(cumulative(CANDIDATE, 100_000n)).toBeLessThanOrEqual(M);
  });

  it("hits the documented milestones", () => {
    // PROTOCOL.md §4.1 table
    expect(share(1008n)).toBeCloseTo(0.5, 5);
    expect(share(2016n)).toBeCloseTo(0.75, 5);
    expect(share(3024n)).toBeCloseTo(0.875, 5);
    expect(share(6048n)).toBeCloseTo(0.984375, 5);
  });

  it("is monotone non-decreasing", () => {
    let prev = -1n;
    for (let n = 0n; n < 20_000n; n += 13n) {
      const v = cumulative(CANDIDATE, n);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("budgets telescope", () => {
  it("slicing a range differently cannot change the total", () => {
    const total = budget(CANDIDATE, 0n, 3024n);
    let summed = 0n;
    for (let a = 0n; a < 3024n; a += 6n) summed += budget(CANDIDATE, a, a + 6n);
    expect(summed).toBe(total);
  });

  it("agrees across uneven slices", () => {
    const total = budget(CANDIDATE, 100n, 5000n);
    const cuts = [100n, 137n, 900n, 2011n, 2012n, 4999n, 5000n];
    let summed = 0n;
    for (let i = 1; i < cuts.length; i++) summed += budget(CANDIDATE, cuts[i - 1], cuts[i]);
    expect(summed).toBe(total);
  });

  it("is never negative", () => {
    for (let a = 0n; a < 8000n; a += 97n) {
      expect(budget(CANDIDATE, a, a + 97n)).toBeGreaterThanOrEqual(0n);
    }
  });
});

describe("terminal offset", () => {
  it("issues nothing further beyond the terminal block", () => {
    const t = terminalOffset(CANDIDATE);
    expect(t).toBeGreaterThan(0n);
    expect(cumulative(CANDIDATE, t)).toBe(M);
    expect(budget(CANDIDATE, t, t + 100_000n)).toBe(0n);
  });
});

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

  it("has a long dead tail before it, holding the last atom back", () => {
    // From roughly 51 half-lives the remainder is a single atom, so epochs are
    // empty; the terminal block is only where that atom finally lands. Under
    // the old rounding the remainder underflowed to zero here instead, which
    // is what made the tail appear to end earlier than the schedule says.
    const t = terminalOffset(CANDIDATE);
    expect(M - cumulative(CANDIDATE, 51_408n)).toBe(1n);
    expect(budget(CANDIDATE, 55_000n, 55_144n)).toBe(0n);
    expect(budget(CANDIDATE, t - 1n, t + 1n)).toBe(1n);
  });
});

/* AUD-13: the doc comment declared floor(M × (1 − p)) while the code computed
 * M − floor(M × p), which rounds the other way. A second implementation built
 * from the specification would have disagreed with this one. */
describe("A(n) is the function the specification states", () => {
  /**
   * floor(M × (1 − 2^(−n/H))), computed exactly in integers.
   *
   * Independent of `exp2neg` and of fixed point altogether: it looks for the
   * remainder `r = M − A` satisfying `(r−1)^H × 2^n < M^H ≤ r^H × 2^n`, which is
   * the fractional power condition raised to the Hth and therefore exact. Only
   * usable for small schedules — `M^H` is astronomically large otherwise — which
   * is why the production schedule is pinned by vector below.
   */
  function exactCumulative(maxSupply: bigint, halfLife: bigint, n: bigint): bigint {
    if (n <= 0n) return 0n;
    const scale = 2n ** n;
    const target = maxSupply ** halfLife;
    let lo = 0n;
    let hi = maxSupply;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      if (target <= mid ** halfLife * scale) hi = mid;
      else lo = mid + 1n;
    }
    return maxSupply - lo;
  }

  const SMALL = { maxWhole: 1000n, decimals: 0, halfLife: 8n };

  it("matches an exact integer reference across a small schedule", () => {
    for (let n = 1n; n <= 40n; n++) {
      expect(cumulative(SMALL, n)).toBe(exactCumulative(1000n, 8n, n));
    }
  });

  it("returns the specified value at the offset the audit reproduced", () => {
    // Reported by the audit's high-precision reference; the implementation
    // returned 1_443_560_240_063 — one atom high — before the rounding fix.
    expect(cumulative(CANDIDATE, 1n)).toBe(1_443_560_240_062n);
  });

  it("is below max supply at every offset before the terminal one", () => {
    // floor(M × (1 − p)) < M whenever p > 0, so every offset the approximation
    // still distinguishes from zero leaves at least one atom outstanding.
    const t = terminalOffset(CANDIDATE);
    for (const n of [1n, 1008n, 10_000n, 51_408n, t - 1n]) {
      expect(cumulative(CANDIDATE, n)).toBeLessThan(M);
    }
  });
});

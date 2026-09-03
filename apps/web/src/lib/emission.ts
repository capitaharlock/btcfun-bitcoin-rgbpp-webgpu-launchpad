/* Discrete emission schedule — PROTOCOL.md §4.1.
 *
 *   A(n) = floor(M × (1 − 2^(−n/H)))        cumulative ceiling at offset n
 *   B([a,b)) = A(b) − A(a)                  budget scheduled over a range
 *
 * `A` is computed as `M − floor(M × 2^(−n/H))` so the subtraction happens in
 * exact integers and the result is monotone non-decreasing. Budgets telescope
 * across contiguous ranges by construction — you cannot get a different total
 * by slicing the range differently, which is the property the old continuous
 * per-block formula did not have.
 */

import { exp2neg, mulQ } from "./fixed";

export interface Schedule {
  /** Maximum supply in whole tokens (21,000,000 in the current candidate). */
  maxWhole: bigint;
  /** Token decimals. Frozen before implementation — see PROTOCOL.md §2. */
  decimals: number;
  /** Half-life in Bitcoin blocks (1008 candidate = half a difficulty period). */
  halfLife: bigint;
}

export const CANDIDATE: Schedule = {
  maxWhole: 21_000_000n,
  decimals: 8,
  halfLife: 1008n,
};

/** Maximum supply expressed in atoms. */
export function maxAtoms(s: Schedule): bigint {
  return s.maxWhole * 10n ** BigInt(s.decimals);
}

/** A(n): cumulative atoms scheduled by block offset `n` from h0. */
export function cumulative(s: Schedule, n: bigint): bigint {
  if (n <= 0n) return 0n;
  const M = maxAtoms(s);
  return M - mulQ(M, exp2neg(n, s.halfLife));
}

/** B([a,b)): atoms scheduled across a half-open range of block offsets. */
export function budget(s: Schedule, a: bigint, b: bigint): bigint {
  if (b <= a) return 0n;
  return cumulative(s, b) - cumulative(s, a);
}

/** Fraction of max supply scheduled by offset `n`, as a 0..1 number (display only). */
export function fractionScheduled(s: Schedule, n: bigint): number {
  const M = maxAtoms(s);
  if (M === 0n) return 0;
  return Number((cumulative(s, n) * 1_000_000n) / M) / 1_000_000;
}

/**
 * The block offset at which the schedule stops issuing anything further,
 * because `floor(M × 2^(−n/H))` has underflowed to zero in integer arithmetic.
 *
 * This is why "perpetual nonzero emission" was withdrawn in PROTOCOL.md §2:
 * with finite arithmetic the tail terminates at a specific, computable block.
 */
export function terminalOffset(s: Schedule): bigint {
  const M = maxAtoms(s);
  let lo = 0n;
  let hi = s.halfLife * 2048n;
  if (mulQ(M, exp2neg(hi, s.halfLife)) !== 0n) return hi; // no terminal in range
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (mulQ(M, exp2neg(mid, s.halfLife)) === 0n) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

/** Per-epoch schedule rows over a window, for charts and tables. */
export interface EpochRow {
  index: number;
  startOffset: bigint;
  endOffset: bigint;
  budget: bigint;
  cumulative: bigint;
}

export function epochRows(
  s: Schedule,
  epochBlocks: bigint,
  count: number,
  from = 0n,
): EpochRow[] {
  const rows: EpochRow[] = [];
  for (let i = 0; i < count; i++) {
    const a = from + BigInt(i) * epochBlocks;
    const b = a + epochBlocks;
    rows.push({
      index: i,
      startOffset: a,
      endOffset: b,
      budget: budget(s, a, b),
      cumulative: cumulative(s, b),
    });
  }
  return rows;
}

/** Headline milestones used across the UI. */
export const MILESTONES: Array<{ label: string; blocks: bigint }> = [
  { label: "1 week", blocks: 1008n },
  { label: "2 weeks", blocks: 2016n },
  { label: "21 days", blocks: 3024n },
  { label: "6 weeks", blocks: 6048n },
  { label: "12 weeks", blocks: 12096n },
];

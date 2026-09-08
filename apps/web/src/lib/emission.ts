/* Discrete emission schedule — PROTOCOL.md §4.1.
 *
 *   A(n) = floor(M × (1 − 2^(−n/H)))        cumulative ceiling at offset n
 *   B([a,b)) = A(b) − A(a)                  budget scheduled over a range
 *
 * `A` is computed as `M − ceil(M × 2^(−n/H))`, which is the same function:
 * `floor(M − x) = M − ceil(x)` for integer `M`. It was written as
 * `M − floor(M × p)`, which rounds the *other* way and returned one atom more
 * than the specification wherever `M × p` was not an integer — 1,443,560,240,063
 * against a true 1,443,560,240,062 at n=1, H=1008. Two independent
 * ports would each implement the specification and disagree with this file,
 * which is exactly the kind of divergence a reference implementation must not
 * introduce.
 *
 * The subtraction still happens in exact integers, so the result stays monotone
 * non-decreasing: `p` is non-increasing in `n`, so `ceil(M × p)` is too.
 * Budgets telescope across contiguous ranges by construction — you cannot get a
 * different total by slicing the range differently, which is the property the
 * old continuous per-block formula did not have.
 *
 * APPROXIMATION. `p` itself is a Q64.64 value produced by truncating
 * multiplications, so it is never above the true `2^(−n/H)`. That bound is not
 * asserted from theory here: `emission.test.ts` checks `A(n)` against an exact
 * integer reference — one that avoids fixed point entirely, by comparing `M^H`
 * with `r^H × 2^n` — over a schedule small enough for that to be computable,
 * and pins the production schedule by vector. An eventual Rust port must pass
 * the same reference, not merely agree with this file.
 */

import { exp2neg, mulQCeil } from "./fixed";

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
  return M - mulQCeil(M, exp2neg(n, s.halfLife));
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
 * The block offset at which the schedule can issue nothing further, because
 * `A(n)` has reached `M` exactly and no later range can carry a budget.
 *
 * This is why "perpetual nonzero emission" was withdrawn in PROTOCOL.md §2:
 * with finite arithmetic the tail terminates at a specific, computable block.
 * It is later under the corrected rounding than under the old one — rounding up
 * keeps the remainder at one atom rather than letting it underflow to zero —
 * and that is a consequence of implementing the specified function, not a
 * change of policy. Long before it, epoch budgets are already zero.
 */
export function terminalOffset(s: Schedule): bigint {
  const M = maxAtoms(s);
  const remainder = (n: bigint) => mulQCeil(M, exp2neg(n, s.halfLife));

  let lo = 0n;
  let hi = s.halfLife * 2048n;
  if (remainder(hi) !== 0n) return hi; // no terminal in range
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (remainder(mid) === 0n) hi = mid;
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

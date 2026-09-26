/* Candidate weighting and what a given amount of work is worth.
 *
 * `clz²` is the §4.2 weight *candidate*; PROTOCOL.md §2 has not adopted it, and
 * the "farm immunity" reading of it was withdrawn. What survives review is the
 * narrower statement below: since the best leading-zero count grows with the
 * logarithm of attempts, weight grows with the square of a logarithm, so raw
 * hardware advantage converts into reward very slowly. That says nothing about
 * ticket splitting or timing strategies, which are separate vectors.
 */

/** Expected best leading-zero count after `n` attempts: log2(n). */
export function expectedClz(hashes: number): number {
  return hashes > 0 ? Math.log2(hashes) : 0;
}

/** The §4.2 weight candidate, unadopted: `clz²`. */
export function weightOf(clz: number): number {
  return clz > 0 ? clz * clz : 0;
}

/**
 * How much more weight `factor`× the hashrate is expected to buy.
 *
 * The ratio is `((c + log2 factor) / c)²` for a baseline of `c = log2(hashes)`,
 * so it depends on the baseline and is never the bare `factor`. A miner already
 * doing 2^20 attempts who multiplies that by a million gains about 4×; one
 * doing 2^10 gains about 9×. The advantage is real, bounded, and largest
 * against the smallest participants — which is the opposite of the reading
 * PROTOCOL.md §2 withdrew. Returns 1 where the ratio is undefined.
 */
export function advantageRatio(baselineHashes: number, factor: number): number {
  if (baselineHashes <= 0 || factor <= 0) return 1;
  const base = weightOf(expectedClz(baselineHashes));
  const scaled = weightOf(expectedClz(baselineHashes * factor));
  return base > 0 ? scaled / base : 1;
}

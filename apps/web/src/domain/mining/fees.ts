/* The fee rate a mining transaction pays.
 *
 * A ticket or a mint that waits in the mempool holds the whole round up, so
 * these pay to get into the next block: the larger of a floor and the
 * provider's "fastest" quote. The floor exists because testnet's "fastest" can
 * read 1 sat/vB and still wait. The rule is domain, the quote is not: the
 * chain provider fetches it and applies this.
 */

/** The floor of the mining fee rate, sat/vB. */
export const MIN_FAST_FEE_RATE = 3;

/** The rate to pay given a quoted "fastest" rate; the floor when the quote is unusable. */
export function fastFrom(fastest: number): number {
  return Number.isFinite(fastest) && fastest > 0 ? Math.max(MIN_FAST_FEE_RATE, Math.ceil(fastest)) : MIN_FAST_FEE_RATE;
}

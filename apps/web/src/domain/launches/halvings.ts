/* Where a launch stands in its halving schedule.
 *
 * Protocol arithmetic on the Bitcoin tip and nothing else, so a real launch
 * and a simulated one are placed by the same code. Three states, never mixed:
 * not open yet, minting inside some halving, or past the last halving at
 * which any hash can mint (`TERMINAL_HALVING`). How a position is worded and
 * drawn is `features/launch/halvings.ts`.
 */

import { HALVING_BLOCKS, MAX_CLZ, terminalHalving } from "@/domain/protocol";

/**
 * Halvings after which even the strongest possible hash mints nothing. From
 * this halving on a launch is spent: tokens still move, but no ticket mints.
 */
export const TERMINAL_HALVING = terminalHalving(MAX_CLZ);

export type HalvingPosition =
  | { state: "announced"; blocksToOpen: number }
  | { state: "minting"; halving: number; elapsed: number; remaining: number }
  | { state: "terminal"; halving: number };

export function halvingPosition(h0: number, tip: number): HalvingPosition {
  if (tip < h0) return { state: "announced", blocksToOpen: h0 - tip };
  const halving = Math.floor((tip - h0) / HALVING_BLOCKS);
  if (halving >= TERMINAL_HALVING) return { state: "terminal", halving };
  const elapsed = (tip - h0) % HALVING_BLOCKS;
  return { state: "minting", halving, elapsed, remaining: HALVING_BLOCKS - elapsed };
}

/* Where a launch stands in its halving schedule, in words and in a bar.
 *
 * The catalogue's segmented bar is the current halving period filling up:
 * blocks since the last halving out of `HALVING_BLOCKS`. It is protocol
 * arithmetic on the Bitcoin tip and nothing else, so a real launch and a
 * simulated one are placed by the same code.
 *
 * Three states, never mixed: not open yet, minting inside some halving, or
 * past the last halving at which any hash can mint (`TERMINAL_HALVING`).
 */

import { blocksAsTime, group } from "@/ui/format";
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

/** Share of the current halving period behind us, 0 to 1: what the bar fills to. */
export function periodShare(p: HalvingPosition): number {
  switch (p.state) {
    case "announced":
      return 0;
    case "minting":
      return p.elapsed / HALVING_BLOCKS;
    case "terminal":
      return 1;
  }
}

/** The reward divisor after `halving` halvings, as a person reads it: ÷1, ÷4, ÷1,024, ÷2^20. */
export function divisorLabel(halving: number): string {
  return halving <= 12 ? `÷${group(2 ** halving)}` : `÷2^${halving}`;
}

/** The label over the bar, e.g. "Halving 2 · 612/1008 blocks · rate ÷4". */
export function halvingLabel(p: HalvingPosition): string {
  switch (p.state) {
    case "announced":
      return `Not open · ${group(p.blocksToOpen)} blocks to go`;
    case "minting":
      return `Halving ${p.halving} · ${group(p.elapsed)}/${group(HALVING_BLOCKS)} blocks · rate ${divisorLabel(p.halving)}`;
    case "terminal":
      return `Halving ${p.halving} · terminal`;
  }
}

/** One line under the bar: where the launch is and what happens next. */
export function whereNow(p: HalvingPosition): string {
  switch (p.state) {
    case "announced":
      return `Opens in ${group(p.blocksToOpen)} block${p.blocksToOpen === 1 ? "" : "s"} (${blocksAsTime(p.blocksToOpen)}) at the full rate.`;
    case "minting":
      return `Rate halves in ${group(p.remaining)} block${p.remaining === 1 ? "" : "s"} (${blocksAsTime(p.remaining)}).`;
    case "terminal":
      return `Terminal: nothing mints after halving ${TERMINAL_HALVING - 1}.`;
  }
}

/** Rungs drawn on the halving ladder: the first four halvings. */
export const LADDER_RUNGS = 4;

export type RungState = "past" | "now" | "next";

/** Each of the first `LADDER_RUNGS` halvings, relative to where the launch is. */
export function ladder(p: HalvingPosition): RungState[] {
  const current = p.state === "announced" ? -1 : p.halving;
  return Array.from({ length: LADDER_RUNGS }, (_, k) => (k < current ? "past" : k === current ? "now" : "next"));
}

/* Launches, placed in time.
 *
 * Every launch here is a real announcement — created in this browser or seen
 * through the index, and checked against the token identity its terms produce.
 * There are no sample launches: a catalogue of invented projects with invented
 * reserves and holder counts would be exactly the overstatement PROTOCOL.md §3
 * forbids. An empty list says so and offers to create the first one.
 *
 * Block height is the clock. A launch opens at `h0`; its current rate is set
 * by how many halvings have passed since then, and each ticket locks in the
 * rate of the block it is bought at.
 */

import { blocksToNextHalving, halvingsAt } from "../lib/standard";
import { publicExtras, termsOf, type LaunchCommitment, type LaunchLinks, type LaunchStory } from "../lib/launches/create";
import type { LaunchTerms } from "../lib/rgbpp/launch";

/** A launch as announced. */
export interface LaunchSpec {
  id: string;
  symbol: string;
  name: string;
  blurb: string;
  accent: string;
  imageHash: string;
  /** Bitcoin height at which minting opens. */
  h0: number;
  /** Bitcoin address every ticket pays. */
  promoter: string;
  /** xUDT type hash: the token's permanent identifier. */
  tokenId: string;
  terms: LaunchTerms;
  /** Identity that announced it. */
  creator: string;
  announcedAt: string;
  /** Project links, re-checked on arrival. Signed by the creator, not enforced on chain. */
  links: LaunchLinks;
  /** Why and what for, in the creator's words. Signed by the creator, not enforced on chain. */
  story: LaunchStory;
}

export type LaunchPhase = "announced" | "minting" | "spent";

/** A launch placed in time against a known tip. */
export interface Launch extends LaunchSpec {
  phase: LaunchPhase;
  /** True once the tip has reached `h0`. */
  open: boolean;
  /** Halvings since opening: the rate a ticket bought now would lock in. Null before opening. */
  halvings: number | null;
  /** Blocks until the rate halves again — or until opening, before it. */
  blocksToHalving: number;
}

/**
 * Halvings after which even the strongest possible hash mints nothing
 * (`terminalHalving(256)` in `standard.ts`). A launch past it is spent:
 * tokens still move, but no ticket can mint.
 */
export const TERMINAL_HALVING = 43;

/**
 * Height used before the live tip has arrived.
 *
 * Only a placeholder so the first paint has coherent numbers; every screen
 * dims its figures until the provider answers.
 */
export const FALLBACK_TIP = 0;

export function specFor(c: LaunchCommitment): LaunchSpec {
  return {
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    blurb: c.blurb,
    accent: c.accent,
    imageHash: c.imageHash,
    h0: c.h0,
    promoter: c.promoter,
    tokenId: c.tokenId,
    terms: termsOf(c),
    creator: c.creator,
    announcedAt: c.at,
    ...publicExtras(c),
  };
}

export function resolve(spec: LaunchSpec, tip: number): Launch {
  const halvings = halvingsAt(spec.h0, tip);
  return {
    ...spec,
    open: halvings !== null,
    halvings,
    blocksToHalving: blocksToNextHalving(spec.h0, tip),
    phase: halvings === null ? "announced" : halvings >= TERMINAL_HALVING ? "spent" : "minting",
  };
}

export function phaseTone(phase: LaunchPhase): "amber" | "cyan" | undefined {
  switch (phase) {
    case "minting":
      return "amber";
    case "announced":
      return "cyan";
    case "spent":
      return undefined;
  }
}

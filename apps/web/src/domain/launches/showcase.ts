/* Simulated launches: what the catalogue looks like further along.
 *
 * Every real launch is young, so on its own the catalogue could only ever
 * show halving 0. These examples show the other states a launch passes
 * through — deep into its halvings with a large supply, spent, not yet open —
 * so a visitor can read a card before a real launch gets there.
 *
 * They are examples and are typed as examples. `source: "simulated"` has no
 * terms, no token id and no promoter, so no function that mints, lists, buys
 * or reads CKB can be handed one, and every surface that shows one says
 * SIMULATED. Their numbers are nonetheless the standard's: each supply is
 * the sum of the mints in its tally at the reward those mints would have
 * earned (`reward` in `domain/protocol/standard.ts`), and no tally has a mint in a
 * halving the launch has not reached. `showcase.test.ts` holds them to that.
 */

import type { TokenArt } from "./image";
import { HALVING_BLOCKS, reward } from "@/domain/protocol";
import { place, type Launch, type Placement } from "./catalogue";

/** Mints of one size in one halving period. */
export interface MintTally {
  halving: number;
  /** Leading zero bits of each of these mints' hashes. */
  clz: number;
  count: number;
}

/** An example launch, before it is placed against the tip. */
export interface ShowcaseSpec {
  id: string;
  symbol: string;
  name: string;
  blurb: string;
  accent: string;
  art: TokenArt;
  /** Blocks since it opened; negative for one that opens in that many blocks. */
  age: number;
  tallies: readonly MintTally[];
  /** Miner cells it would have: never more than the mints that needed one. */
  minerCells: number;
}

/** An example launch placed against the tip. */
export interface SimulatedLaunch extends Placement {
  source: "simulated";
  id: string;
  symbol: string;
  name: string;
  blurb: string;
  accent: string;
  art: TokenArt;
  h0: number;
  /** Atoms, the sum of its tallies at the standard reward. */
  supply: bigint;
  mints: number;
  minerCells: number;
}

/** What a catalogue box can show: a real launch or a labelled example. */
export type CatalogueEntry = Launch | SimulatedLaunch;

const art = (name: string): TokenArt => ({ src: `/tokens/${name}.svg`, by: "platform" });
const WEEK = HALVING_BLOCKS;

export const SHOWCASE: readonly ShowcaseSpec[] = [
  {
    id: "example-surf",
    symbol: "SURF",
    name: "Surf Town",
    blurb: "A beach town's surf club, raising for boards and lessons for local kids.",
    accent: "var(--cyan)",
    art: art("surf"),
    age: 180,
    tallies: [
      { halving: 0, clz: 17, count: 21 },
      { halving: 0, clz: 19, count: 12 },
      { halving: 0, clz: 22, count: 4 },
    ],
    minerCells: 14,
  },
  {
    id: "example-homes",
    symbol: "HOMES",
    name: "Block Homes",
    blurb: "Neighbours pooling for repairs on a shared street of old houses.",
    accent: "var(--amber)",
    art: art("homes"),
    age: 2 * WEEK + 612,
    tallies: [
      { halving: 0, clz: 18, count: 1_460 },
      { halving: 0, clz: 21, count: 610 },
      { halving: 0, clz: 25, count: 38 },
      { halving: 1, clz: 18, count: 1_120 },
      { halving: 1, clz: 21, count: 505 },
      { halving: 1, clz: 26, count: 11 },
      { halving: 2, clz: 18, count: 402 },
      { halving: 2, clz: 22, count: 131 },
    ],
    minerCells: 386,
  },
  {
    id: "example-earth",
    symbol: "EARTH",
    name: "Bitcoin Saves the World",
    blurb: "Plants a tree for every block its community mines. Hopeful, loud, relentless.",
    accent: "var(--mint)",
    art: art("earth"),
    age: 3 * WEEK + 190,
    tallies: [
      { halving: 0, clz: 19, count: 2_210 },
      { halving: 0, clz: 23, count: 97 },
      { halving: 1, clz: 19, count: 1_730 },
      { halving: 1, clz: 24, count: 22 },
      { halving: 2, clz: 19, count: 940 },
      { halving: 3, clz: 20, count: 206 },
    ],
    minerCells: 512,
  },
  {
    id: "example-books",
    symbol: "BOOKS",
    name: "Library Guild",
    blurb: "Keeps a small-town library open late, one mined block at a time.",
    accent: "var(--violet)",
    art: art("books"),
    age: 9 * WEEK + 870,
    tallies: [
      { halving: 0, clz: 18, count: 3_400 },
      { halving: 1, clz: 18, count: 2_900 },
      { halving: 2, clz: 19, count: 2_100 },
      { halving: 3, clz: 19, count: 1_450 },
      { halving: 4, clz: 20, count: 980 },
      { halving: 5, clz: 20, count: 610 },
      { halving: 6, clz: 21, count: 300 },
      { halving: 7, clz: 21, count: 142 },
      { halving: 8, clz: 22, count: 61 },
      { halving: 9, clz: 23, count: 17 },
    ],
    minerCells: 1_204,
  },
  {
    id: "example-kickoff",
    symbol: "KICKOFF",
    name: "Sunday League",
    blurb: "An amateur football league's first season fund. Long finished minting.",
    accent: "var(--magenta)",
    art: art("kickoff"),
    age: 43 * WEEK + 240,
    tallies: [
      { halving: 0, clz: 18, count: 5_100 },
      { halving: 1, clz: 18, count: 3_870 },
      { halving: 2, clz: 19, count: 2_480 },
      { halving: 3, clz: 19, count: 1_390 },
      { halving: 4, clz: 20, count: 720 },
      { halving: 6, clz: 21, count: 240 },
      { halving: 10, clz: 22, count: 44 },
      { halving: 20, clz: 24, count: 6 },
    ],
    minerCells: 1_630,
  },
  {
    id: "example-brew",
    symbol: "BREW",
    name: "Corner Coffee",
    blurb: "A co-op café turning regulars into owners. Doors open soon.",
    accent: "var(--warn)",
    art: art("brew"),
    age: -90,
    tallies: [],
    minerCells: 0,
  },
];

/** Atoms a tally mints, at the standard reward for its halving. */
export function supplyOf(tallies: readonly MintTally[]): bigint {
  // The reward depends on the halving count only, so any opening height works.
  return tallies.reduce((sum, t) => sum + BigInt(t.count) * reward(t.clz, 0, t.halving * HALVING_BLOCKS), 0n);
}

export function placeExample(spec: ShowcaseSpec, tip: number): SimulatedLaunch {
  const h0 = tip - spec.age;
  return {
    source: "simulated",
    id: spec.id,
    symbol: spec.symbol,
    name: spec.name,
    blurb: spec.blurb,
    accent: spec.accent,
    art: spec.art,
    h0,
    supply: supplyOf(spec.tallies),
    mints: spec.tallies.reduce((n, t) => n + t.count, 0),
    minerCells: spec.minerCells,
    ...place(h0, tip),
  };
}

/** The examples, placed against the tip so each stays in the state it illustrates. */
export function showcase(tip: number): SimulatedLaunch[] {
  return SHOWCASE.map((spec) => placeExample(spec, tip));
}

export function isSimulated(entry: CatalogueEntry): entry is SimulatedLaunch {
  return entry.source === "simulated";
}

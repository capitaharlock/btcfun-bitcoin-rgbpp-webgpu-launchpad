/* Launches, placed in time.
 *
 * Every launch here is a real announcement — created in this browser or seen
 * through the index, and checked against the token identity its terms produce.
 * The catalogue also shows a few simulated examples (`./showcase.ts`), but
 * they are a different type: `source: "simulated"` against `source: "chain"`
 * here, with no terms, token id or promoter, so no code path that mints, lists
 * or buys can be handed one. An empty list of real launches still says so.
 *
 * Block height is the clock. A launch opens at `h0`; its current rate is set
 * by how many halvings have passed since then, and each ticket locks in the
 * rate of the block it is bought at.
 */

import { blocksToNextHalving, halvingsAt } from "../lib/standard";
import { publicExtras, termsOf, type LaunchCommitment, type LaunchLinks, type LaunchStory } from "../lib/launches/create";
import { admissionBytes } from "../lib/launches/certificate";
import { artFor, type TokenArt } from "../lib/launches/image";
import { halvingPosition, TERMINAL_HALVING, type HalvingPosition } from "../lib/launches/progress";
import type { LaunchTerms } from "../lib/rgbpp/launch";

/** A launch as announced. */
export interface LaunchSpec {
  /** A real announcement whose id matches its token on CKB. */
  source: "chain";
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
  /**
   * btc.fun's admission of the launch — registration txid and certificate —
   * as the first arming of every miner's cell carries it
   * (`lib/launches/certificate.ts`).
   */
  admission: Uint8Array;
  /** The registration's txid; all zeros when the platform admitted the launch itself. */
  registration: string;
  /** Identity that announced it. */
  creator: string;
  announcedAt: string;
  /** Project links, re-checked on arrival. Signed by the creator, not enforced on chain. */
  links: LaunchLinks;
  /** Why and what for, in the creator's words. Signed by the creator, not enforced on chain. */
  story: LaunchStory;
  /** The token's picture and who supplied it; null draws the pixel sigil. */
  art: TokenArt | null;
}

export type LaunchPhase = "announced" | "minting" | "spent";

/** Where something with an opening height stands against a known tip. */
export interface Placement {
  phase: LaunchPhase;
  /** True once the tip has reached `h0`. */
  open: boolean;
  /** Halvings since opening: the rate a ticket bought now would lock in. Null before opening. */
  halvings: number | null;
  /** Blocks until the rate halves again — or until opening, before it. */
  blocksToHalving: number;
  /** The same, as the catalogue's bar and sentence read it. */
  position: HalvingPosition;
}

/** A launch placed in time against a known tip. */
export interface Launch extends LaunchSpec, Placement {}

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
    admission: admissionBytes(c.registration, c.certificate),
    registration: c.registration,
    creator: c.creator,
    announcedAt: c.at,
    ...publicExtras(c),
    source: "chain",
    art: artFor(c),
  };
}

export function place(h0: number, tip: number): Placement {
  const halvings = halvingsAt(h0, tip);
  return {
    open: halvings !== null,
    halvings,
    blocksToHalving: blocksToNextHalving(h0, tip),
    phase: halvings === null ? "announced" : halvings >= TERMINAL_HALVING ? "spent" : "minting",
    position: halvingPosition(h0, tip),
  };
}

export function resolve(spec: LaunchSpec, tip: number): Launch {
  return { ...spec, ...place(spec.h0, tip) };
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

/* A launch's sigil: an 11×8 invader, mirrored, in two frames, derived from its id.
 *
 * Every launch needs a recognisable object in a grid, a table row, a header
 * and a feed line, and none of them should need an uploaded image. A sprite
 * mirrored about its vertical axis reads as a creature rather than as noise —
 * the trick the first arcade invaders used — and giving each band of rows its
 * own density (sparse antennae, a dense body with a pair of eyes, sparse legs)
 * makes it read as *that* kind of creature. The second frame redraws only the
 * legs, so the idle animation is the familiar two-step march.
 *
 * Pure and deterministic: the same id draws the same sprite in every browser,
 * and nothing about it is stored.
 */

import { pixelPath } from "./pixels";
import { hashSeed, seeded } from "./random";

export const SIGIL_WIDTH = 11;
export const SIGIL_HEIGHT = 8;

/** 0 is empty, 1 the accent, 2 the accent's highlight. */
export type SigilCell = 0 | 1 | 2;

/** Rows of cells, `SIGIL_HEIGHT` rows of `SIGIL_WIDTH`. */
export type SigilFrame = SigilCell[][];

export interface SigilSprite {
  /** Standing, and mid-step. Frame one is the still image. */
  frames: readonly [SigilFrame, SigilFrame];
}

/** Columns drawn at random: the left half and the centre column. */
const HALF = Math.ceil(SIGIL_WIDTH / 2);
/** Chance a cell is lit, by row: antennae, head, body, hips, legs. */
const DENSITY = [0.28, 0.5, 0.85, 0.85, 0.85, 0.62, 0.4, 0.34];
/** Rows the second frame redraws: the legs. */
const LEG_ROWS = [6, 7];
/** Share of lit cells, so no sprite is a speck and none a block. */
const MIN_FILL = 0.3;
const MAX_FILL = 0.72;
/** Share of lit body cells drawn in the highlight tone. */
const HIGHLIGHT = 0.22;

function drawRow(next: () => number, y: number): SigilCell[] {
  const half: SigilCell[] = [];
  for (let x = 0; x < HALF; x++) {
    const lit = next() < DENSITY[y];
    const body = y >= 2 && y <= 5;
    half.push(lit ? (body && next() < HIGHLIGHT ? 2 : 1) : 0);
  }
  return mirror(half);
}

/** The left half and centre column, reflected into a full row. */
function mirror(half: SigilCell[]): SigilCell[] {
  return [...half, ...half.slice(0, SIGIL_WIDTH - HALF).reverse()];
}

function fill(frame: SigilFrame): number {
  return frame.flat().filter((c) => c !== 0).length / (SIGIL_WIDTH * SIGIL_HEIGHT);
}

/** The sprite for a seed. Draws until the shape is in bounds; the redraws are
 *  part of the sequence, so the result is still a function of the seed. */
export function pixelSigil(seed: string): SigilSprite {
  const next = seeded(hashSeed(seed));
  for (;;) {
    const frame: SigilFrame = Array.from({ length: SIGIL_HEIGHT }, (_, y) => drawRow(next, y));

    // Eyes: a mirrored pair of holes in the head, each with lit cells either
    // side, so the face survives whatever the dice did to the body.
    const eyeRow = 2 + Math.floor(next() * 2);
    const eyeCol = 1 + Math.floor(next() * (HALF - 2));
    for (const x of [eyeCol, SIGIL_WIDTH - 1 - eyeCol]) {
      frame[eyeRow][x] = 0;
      frame[eyeRow][x - 1] ||= 1;
      frame[eyeRow][x + 1] ||= 1;
    }

    const share = fill(frame);
    if (share < MIN_FILL || share > MAX_FILL) continue;

    const step = frame.map((row) => [...row]);
    for (let attempt = 0; attempt < 16; attempt++) {
      for (const y of LEG_ROWS) step[y] = drawRow(next, y);
      if (LEG_ROWS.some((y) => step[y].join() !== frame[y].join())) break;
    }
    return { frames: [frame, step] };
  }
}

/** One SVG path per tone and frame. */
export function sigilPaths(sprite: SigilSprite): Array<{ base: string; highlight: string }> {
  return sprite.frames.map((frame) => ({ base: pixelPath(frame, 1), highlight: pixelPath(frame, 2) }));
}

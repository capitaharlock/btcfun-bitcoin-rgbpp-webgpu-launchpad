/* Hashes as shots: how strong a hash is (each extra zero bit half as likely,
 * as in mining), the text it carries, and its flight — swept row by row so a
 * fast shot cannot pass through thin cover. */

import { MIN_CLZ } from "../../../lib/standard";
import { GLYPH_H } from "../font";
import { erode } from "./bunker";
import type { Rand, Scene, Shot } from "./types";

export const SHOT_SPEED = 0.16; // cells per ms
/** Hashes in the scene: at least `MIN_CLZ` zero bits, and the odds halve per extra bit, as mining's do. */
export const CLZ_MIN = MIN_CLZ;
export const CLZ_MAX = MIN_CLZ + 8;
/** Hash characters in a shot: the leading zeros, then two more. */
const SHOT_TAIL = 2;

/** A hash's strength: `CLZ_MIN` bits or more, each further bit half as likely, as in mining. */
export function drawClz(rand: Rand): number {
  let clz = CLZ_MIN;
  while (clz < CLZ_MAX && rand() < 0.5) clz++;
  return clz;
}

/** A hash with `clz` leading zero bits, as the shot's text: zeros, then a tail. */
export function shotHash(clz: number, rand: Rand, tail = SHOT_TAIL): { text: string; zeros: number } {
  const zeros = Math.floor(clz / 4);
  // The first character after the zeros is bounded by the remaining zero bits.
  // Exactly `clz` zero bits: the next nibble has its first one bit where the
  // count stops, so it lies in [8 >> rest, 16 >> rest).
  const rest = clz % 4;
  const first = (8 >> rest) + Math.floor(rand() * (8 >> rest));
  let text = first.toString(16);
  for (let i = 1; i < tail; i++) text += Math.floor(rand() * 16).toString(16);
  return { text: "0".repeat(zeros) + text, zeros };
}

/** Height of a shot in cells: one glyph per character, one cell between. */
export function shotLength(shot: Pick<Shot, "text">): number {
  return shot.text.length * (GLYPH_H + 1) - 1;
}

/**
 * Visit each whole row a point crosses moving from `from` to `to`, in order,
 * until `visit` says it struck something. A fast shot moves several cells per
 * step; testing only where it lands would let it pass through thin cover.
 */
export function sweep(from: number, to: number, visit: (y: number) => boolean): number | null {
  const dir = Math.sign(to - from);
  let y = from;
  for (; dir > 0 ? y <= to : y >= to; y += dir) {
    if (visit(y)) return y;
    if (dir === 0) return null;
  }
  // The last whole step fell short of `to`: test where it actually ends.
  return y - dir !== to && visit(to) ? to : null;
}

/**
 * Move a shot up by `distance`, testing its tip against the bunkers and then
 * whatever `strike` knows about. Returns false once the shot is spent.
 */
export function flyShot(scene: Scene, shot: Shot, distance: number, rand: Rand, strike: (x: number, y: number) => boolean): boolean {
  const tipX = shot.x + 1;
  const from = shot.y;
  shot.y -= distance;
  const hit = sweep(from, shot.y, (y) => scene.bunkers.some((b) => erode(b, tipX, y, rand, -1)) || strike(tipX, y));
  if (hit !== null) return false;
  return shot.y + shotLength(shot) >= 0;
}

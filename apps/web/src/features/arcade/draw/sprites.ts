/* The game's own sprites, as bitmaps: the mystery ship, a life in reserve and
 * the bomb's two frames. The invaders are each launch's sigil and the cannon
 * is the scene's (`scene/geometry`), so neither is here.
 */

import type { PixelGrid } from "@/ui/pixels/pixels";
import { fromBitmap } from "@/ui/pixels/pixels";

/** The mystery ship: a saucer, lights along its rim. */
export const UFO: PixelGrid = fromBitmap([
  ".....######.....",
  "...##########...",
  "..############..",
  ".##.##.##.##.##.",
  "################",
  "..###..##..###..",
  "...#........#...",
]);

/** A life in reserve: the cannon, small. */
export const LIFE: PixelGrid = fromBitmap(["...#...", "..###..", "#######", "#######"]);

/** A bomb's two frames: a zigzag that wriggles as it falls. */
export const BOMB: readonly [PixelGrid, PixelGrid] = [
  fromBitmap([".#.", "#..", ".#.", "..#", ".#.", "#.."]),
  fromBitmap([".#.", "..#", ".#.", "#..", ".#.", "..#"]),
];

/* The bunkers: cover that erodes a cell at a time — bored from below by a
 * hash, bitten from above by a bomb, scoured by an invader marching through —
 * so a long game wears its cover away the way the original did. */

import { cannonY } from "./geometry";
import type { Bunker, Rand, Rect, Scene } from "./types";

const BUNKER = [
  "..########..",
  ".##########.",
  "############",
  "############",
  "####....####",
  "###......###",
];
export const BUNKER_W = BUNKER[0].length;
export const BUNKER_H = BUNKER.length;

export function bunkerY(scene: Pick<Scene, "height">): number {
  return cannonY(scene) - BUNKER_H - 8;
}

export function freshBunker(): boolean[][] {
  return BUNKER.map((row) => [...row].map((c) => c === "#"));
}

export function placeBunkers(scene: Pick<Scene, "left" | "right" | "height">): Bunker[] {
  const span = scene.right - scene.left;
  const count = Math.max(2, Math.min(4, Math.floor(span / 48)));
  const y = bunkerY(scene);
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(scene.left + ((i + 0.5) * span) / count - BUNKER_W / 2),
    y,
    cells: freshBunker(),
  }));
}

/**
 * Remove the bunker cell under a point, and a neighbour or two further along
 * the projectile's way (`dir` −1 going up, 1 coming down), so a shot bores up
 * from underneath and a bomb bites down from above. Returns true on a hit.
 */
export function erode(bunker: Bunker, x: number, y: number, rand: Rand, dir: -1 | 1 = -1): boolean {
  const cx = Math.floor(x - bunker.x);
  const cy = Math.floor(y - bunker.y);
  if (!solid(bunker, cx, cy)) return false;
  bunker.cells[cy][cx] = false;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, dir], [-1, dir], [1, dir]]) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (solid(bunker, nx, ny) && rand() < 0.45) bunker.cells[ny][nx] = false;
  }
  return true;
}

function solid(bunker: Bunker, cx: number, cy: number): boolean {
  return cy >= 0 && cy < BUNKER_H && cx >= 0 && cx < BUNKER_W && bunker.cells[cy][cx];
}

/** Clear every bunker cell a rectangle covers: an invader marching through cover. */
export function scour(bunker: Bunker, rect: Rect): void {
  for (let cy = Math.max(0, rect.y - bunker.y); cy < Math.min(BUNKER_H, rect.y + rect.h - bunker.y); cy++) {
    for (let cx = Math.max(0, rect.x - bunker.x); cx < Math.min(BUNKER_W, rect.x + rect.w - bunker.x); cx++) {
      bunker.cells[cy][cx] = false;
    }
  }
}

export function bunkerLeft(bunker: Bunker): number {
  return bunker.cells.flat().filter(Boolean).length;
}

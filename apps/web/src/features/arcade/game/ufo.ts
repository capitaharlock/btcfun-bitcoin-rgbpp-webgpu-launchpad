/* The mystery ship: the next Bitcoin block, crossing the top of the field
 * while enough invaders remain, and paying a flat bonus when hit.
 */

import type { Rand, Rect } from "../scene";
import { UFO_BONUSES, UFO_H, UFO_MIN_INVADERS, UFO_SPEED, UFO_W, UFO_Y } from "./constants";
import { living } from "./field";
import type { Game, Ufo } from "./types";

export function ufoRect(ufo: Pick<Ufo, "x">): Rect {
  return { x: Math.round(ufo.x), y: UFO_Y, w: UFO_W, h: UFO_H };
}

export function ufoGap(rand: Rand): number {
  return 20_000 + rand() * 10_000;
}

export function flyUfo(game: Game, dt: number, rand: Rand): void {
  const scene = game.scene;
  if (!game.ufo) {
    if (scene.time < game.nextUfo || living(scene).length < UFO_MIN_INVADERS) return;
    const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
    const bonus = UFO_BONUSES[Math.floor(rand() * UFO_BONUSES.length)];
    game.ufo = { x: dir === 1 ? scene.left - UFO_W : scene.right, dir, block: game.block, bonus };
    game.events.push({ kind: "ufo" });
    return;
  }
  const ufo = game.ufo;
  ufo.x += ufo.dir * UFO_SPEED * dt;
  if (ufo.x > scene.right || ufo.x < scene.left - UFO_W) {
    game.ufo = null;
    game.nextUfo = scene.time + ufoGap(rand);
  }
}

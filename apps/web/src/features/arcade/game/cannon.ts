/* The cannon: where it is under the controls, what counts as a hit on it, and
 * what losing it does to the game.
 */

import { CANNON, cannonY, clamp } from "../scene/geometry";
import { burst } from "../scene/step";
import { CANNON_SIZE, type Rand, type Scene } from "../scene";
import { DYING_MS, PLAYER_SPEED } from "./constants";
import type { Cause, Controls, Game } from "./types";

/** Whether a point is on a lit cell of the cannon: a bomb past the barrel's side misses. */
export function hitsCannon(scene: Scene, x: number, y: number): boolean {
  const gx = Math.floor(x - Math.round(scene.cannon.x - CANNON_SIZE.w / 2));
  const gy = Math.floor(y - cannonY(scene));
  return gy >= 0 && gy < CANNON_SIZE.h && gx >= 0 && gx < CANNON_SIZE.w && CANNON[gy][gx] === 1;
}

export function steer(game: Game, dt: number, controls: Controls): void {
  const c = game.scene.cannon;
  const reach = PLAYER_SPEED * dt;
  let move = ((controls.right ? 1 : 0) - (controls.left ? 1 : 0)) * reach;
  if (move === 0 && controls.aim !== null) move = clamp(controls.aim - c.x, -reach, reach);
  const half = CANNON_SIZE.w / 2;
  c.x = clamp(c.x + move, game.scene.left + half, game.scene.right - half);
  c.target = c.x;
}

export function killPlayer(game: Game, cause: Cause, rand: Rand): void {
  const scene = game.scene;
  const c = scene.cannon;
  burst(scene, { x: c.x - CANNON_SIZE.w / 2, y: cannonY(scene), w: CANNON_SIZE.w, h: CANNON_SIZE.h }, "bitcoin", rand, 40);
  game.lives = Math.max(0, game.lives - 1);
  scene.shots = [];
  game.phase = { kind: "dying", until: scene.time + DYING_MS, cause };
  game.events.push({ kind: "playerHit" });
}

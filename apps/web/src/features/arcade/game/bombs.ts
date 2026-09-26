/* Bombs: the formation's fire. How often and how many for a wave, which
 * column drops one, and what a falling bomb does to the cover and the cannon.
 */

import { groundY, invaderRect, SPRITE_H, SPRITE_W } from "../scene/geometry";
import { burst } from "../scene/step";
import type { Rand, Rect } from "../scene";
import { sweep } from "../scene/shots";
import { erode } from "../scene/bunker";
import { hitsCannon, killPlayer } from "./cannon";
import { BOMB_H, BOMB_SPEED, BOMB_W } from "./constants";
import { living } from "./field";
import type { Bomb, Game } from "./types";

export function bombGap(wave: number): number {
  return Math.max(320, 1_100 * 0.88 ** (wave - 1));
}

function maxBombs(wave: number): number {
  return Math.min(4, 2 + Math.floor((wave - 1) / 2));
}

function bombSpeed(wave: number): number {
  return BOMB_SPEED * Math.min(1.6, 1 + 0.08 * (wave - 1));
}

export function bombRect(bomb: Pick<Bomb, "x" | "y">): Rect {
  return { x: Math.round(bomb.x), y: Math.round(bomb.y), w: BOMB_W, h: BOMB_H };
}

export function dropBombs(game: Game, rand: Rand): void {
  const scene = game.scene;
  if (scene.time < game.nextBomb) return;
  game.nextBomb = scene.time + bombGap(game.wave) * (0.5 + rand());
  if (game.bombs.length >= maxBombs(game.wave)) return;
  const live = living(scene);
  if (live.length === 0) return;
  // Half the bombs come from the column over the cannon: the formation aims.
  const cols = [...new Set(live.map((inv) => inv.col))];
  const f = scene.formation;
  const over = (col: number) => Math.abs(f.x + col * f.pitchX + SPRITE_W / 2 - scene.cannon.x);
  const col =
    rand() < 0.5 ? cols.reduce((a, b) => (over(b) < over(a) ? b : a)) : cols[Math.floor(rand() * cols.length)];
  const lowest = live.filter((inv) => inv.col === col).reduce((a, b) => (b.row > a.row ? b : a));
  const rect = invaderRect(scene, lowest);
  game.bombs.push({ x: rect.x + Math.floor((SPRITE_W - BOMB_W) / 2), y: rect.y + SPRITE_H, spec: lowest.spec });
}

export function moveBombs(game: Game, dt: number, rand: Rand): void {
  const scene = game.scene;
  const floor = groundY(scene);
  game.bombs = game.bombs.filter((bomb) => {
    const from = bomb.y + BOMB_H;
    bomb.y += bombSpeed(game.wave) * dt;
    const x = Math.round(bomb.x) + 1;
    let struck: "cover" | "cannon" | null = null;
    sweep(from, bomb.y + BOMB_H, (y) => {
      if (scene.bunkers.some((b) => erode(b, x, y, rand, 1))) struck = "cover";
      else if (scene.time >= game.safeUntil && [x - 1, x, x + 1].some((bx) => hitsCannon(scene, bx, y))) struck = "cannon";
      return struck !== null;
    });
    if (struck === "cannon") {
      killPlayer(game, "shot", rand);
      return false;
    }
    if (struck === "cover") return false;
    if (bomb.y + BOMB_H >= floor) {
      burst(scene, { x: bomb.x - 1, y: floor - 2, w: BOMB_W + 2, h: 2 }, bomb.spec, rand, 5);
      return false;
    }
    return true;
  });
  if (game.phase.kind !== "playing") game.bombs = [];
}

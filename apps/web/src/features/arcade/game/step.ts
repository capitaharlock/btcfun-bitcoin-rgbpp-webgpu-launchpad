/* A game's life: creating one, and advancing it by a time step through its
 * phases — the intro, play, the cannon down, the game over.
 *
 * `stepGame` takes the player's controls and a random source; what a frame
 * should sound like comes back as `events` on the game.
 */

import { cannonY } from "../scene/geometry";
import { createScene, stepEffects, stepStars } from "../scene/step";
import { type InvaderSpec, type Rand, type SceneBounds } from "../scene";
import { drawClz, shotHash } from "../scene/shots";
import { bombGap, dropBombs, moveBombs } from "./bombs";
import { steer } from "./cannon";
import { EXTRA_LIFE_EVERY, INTRO_MS, LIVES, SAFE_MS } from "./constants";
import { arrangeWave, living, marchInterval } from "./field";
import { moveShots } from "./shots";
import type { Controls, Game } from "./types";
import { flyUfo } from "./ufo";
import { march, nextWave } from "./waves";

export function createGame(
  specs: readonly InvaderSpec[],
  bounds: SceneBounds,
  rand: Rand,
  { hi, block }: { hi: number; block: number },
): Game {
  if (specs.length === 0) throw new Error("a game needs at least one launch");
  const scene = createScene(specs, bounds, rand);
  arrangeWave(scene, 1);
  scene.cannon.x = scene.cannon.target = Math.round((scene.left + scene.right) / 2);
  return {
    scene,
    phase: { kind: "intro", until: INTRO_MS },
    score: 0,
    hi,
    best: hi,
    lives: LIVES,
    wave: 1,
    total: scene.invaders.length,
    bombs: [],
    ufo: null,
    nextBomb: INTRO_MS + bombGap(1),
    nextUfo: INTRO_MS + 18_000 + rand() * 8_000,
    safeUntil: 0,
    nextLife: EXTRA_LIFE_EVERY,
    beat: 0,
    block,
    events: [{ kind: "wave" }],
  };
}

/** Advance the game by `dt` milliseconds. Mutates and returns it. */
export function stepGame(game: Game, dt: number, controls: Controls, rand: Rand): Game {
  const phase = game.phase;
  if (phase.kind === "paused") return game;
  const scene = game.scene;
  const t = (scene.time += dt);
  stepStars(scene, dt, rand);

  switch (phase.kind) {
    case "intro":
      steer(game, dt, controls);
      if (t >= phase.until) game.phase = { kind: "playing" };
      break;
    case "playing":
      play(game, dt, controls, rand);
      break;
    case "dying":
      if (t >= phase.until) {
        if (game.lives > 0) respawn(game);
        else {
          game.phase = { kind: "over", at: t, cause: phase.cause, record: game.score > game.best };
          game.events.push({ kind: "over" });
        }
      }
      break;
    case "over":
      break;
  }

  stepEffects(scene, dt);
  return game;
}

function play(game: Game, dt: number, controls: Controls, rand: Rand): void {
  const scene = game.scene;
  const t = scene.time;
  steer(game, dt, controls);

  // One hash in flight at a time, as the original allowed one shot.
  if (controls.fire && scene.shots.length === 0) {
    const clz = drawClz(rand);
    const { text, zeros } = shotHash(clz, rand, 1);
    scene.shots.push({ x: Math.round(scene.cannon.x) - 1, y: cannonY(scene) - 1, text, zeros, clz });
    scene.cannon.lastShot = t;
    game.events.push({ kind: "fire" });
  }

  march(game, rand);
  if (game.phase.kind !== "playing") return;
  dropBombs(game, rand);
  moveBombs(game, dt, rand);
  if (game.phase.kind !== "playing") return;
  moveShots(game, dt, rand);
  flyUfo(game, dt, rand);

  if (living(scene).length === 0) nextWave(game);
}

function respawn(game: Game): void {
  const scene = game.scene;
  scene.cannon.x = scene.cannon.target = Math.round((scene.left + scene.right) / 2);
  game.bombs = [];
  game.safeUntil = scene.time + SAFE_MS;
  // The formation stood still while the cannon was down; it resumes from now, not from then.
  scene.formation = { ...scene.formation, next: scene.time + marchInterval(game, living(scene).length) };
  game.nextBomb = scene.time + bombGap(game.wave) * 1.5;
  game.phase = { kind: "playing" };
}

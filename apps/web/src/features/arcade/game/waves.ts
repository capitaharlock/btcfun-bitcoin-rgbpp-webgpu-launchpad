/* The formation's march and the turn of a wave: stepping when the beat is
 * due, scouring the cover it reaches, landing on the cannon, and the next
 * wave once the last invader falls.
 */

import { cannonY, invaderRect } from "../scene/geometry";
import { stepFormation } from "../scene/step";
import type { Rand } from "../scene";
import { scour } from "../scene/bunker";
import { bombGap } from "./bombs";
import { killPlayer } from "./cannon";
import { INTRO_MS } from "./constants";
import { arrangeWave, living, marchInterval } from "./field";
import type { Game } from "./types";

export function march(game: Game, rand: Rand): void {
  const scene = game.scene;
  let live = living(scene);
  while (scene.formation.next <= scene.time) {
    const cols = live.map((inv) => inv.col);
    const bottom = Math.max(...live.map((inv) => inv.row));
    scene.formation = stepFormation(scene.formation, scene, {
      interval: marchInterval(game, live.length),
      cols: [Math.min(...cols), Math.max(...cols)],
      bottom,
      wrap: false,
    });
    game.events.push({ kind: "march", beat: game.beat });
    game.beat = (game.beat + 1) % 4;
    live = living(scene);
  }
  for (const inv of live) {
    const rect = invaderRect(scene, inv);
    for (const bunker of scene.bunkers) scour(bunker, rect);
    if (rect.y + rect.h >= cannonY(scene)) {
      game.lives = 0;
      killPlayer(game, "invaded", rand);
      return;
    }
  }
}

export function nextWave(game: Game): void {
  const scene = game.scene;
  game.wave++;
  arrangeWave(scene, game.wave);
  game.total = scene.invaders.length;
  game.bombs = [];
  game.ufo = null;
  game.nextBomb = scene.time + INTRO_MS + bombGap(game.wave);
  game.phase = { kind: "intro", until: scene.time + INTRO_MS };
  game.events.push({ kind: "wave" });
}

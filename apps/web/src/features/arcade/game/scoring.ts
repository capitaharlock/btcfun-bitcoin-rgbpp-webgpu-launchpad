/* Scoring: points, the running hi-score, and the extra life every so many
 * points. A hit scores the whole tokens the hash would mint (`explode` in
 * `scene/step`); the mystery ship pays its flat bonus.
 */

import { EXTRA_LIFE_EVERY, MAX_LIVES } from "./constants";
import type { Game } from "./types";

export function score(game: Game, points: number): void {
  game.score += points;
  game.hi = Math.max(game.hi, game.score);
  while (game.score >= game.nextLife) {
    game.nextLife += EXTRA_LIFE_EVERY;
    if (game.lives < MAX_LIVES) {
      game.lives++;
      game.events.push({ kind: "extraLife" });
    }
  }
}

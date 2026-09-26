/* The player's shots: hashes in flight, and what one hits — an invader, the
 * mystery ship, or a bomb on its way down.
 */

import { group } from "@/ui/format";
import { invaderAt } from "../scene/geometry";
import { burst, explode } from "../scene/step";
import type { Rand, Rect } from "../scene";
import { flyShot } from "../scene/shots";
import { bombRect } from "./bombs";
import { BOMB_W, SHOT_SPEED, UFO_H, UFO_W, UFO_Y } from "./constants";
import { score } from "./scoring";
import type { Game } from "./types";
import { ufoGap, ufoRect } from "./ufo";

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

export function moveShots(game: Game, dt: number, rand: Rand): void {
  const scene = game.scene;
  scene.shots = scene.shots.filter((shot) =>
    flyShot(scene, shot, SHOT_SPEED * dt, rand, (x, y) => {
      const hit = invaderAt(scene, x, y);
      if (hit >= 0) {
        score(game, explode(scene, hit, shot.clz, rand, Infinity));
        game.events.push({ kind: "hit" });
        return true;
      }
      const ufo = game.ufo;
      if (ufo && inside(ufoRect(ufo), x, y)) {
        const rect = ufoRect(ufo);
        burst(scene, rect, "bitcoin", rand, 24);
        scene.popups.push({ x: rect.x + UFO_W / 2, y: UFO_Y + UFO_H + 8, text: `+${group(ufo.bonus)} BLOCK`, tint: "bitcoin", born: scene.time });
        score(game, ufo.bonus);
        game.ufo = null;
        game.nextUfo = scene.time + ufoGap(rand);
        game.events.push({ kind: "ufoHit" });
        return true;
      }
      const bomb = game.bombs.findIndex((b) => inside({ ...bombRect(b), x: bombRect(b).x - 1, w: BOMB_W + 2 }, x, y));
      if (bomb >= 0) {
        burst(scene, bombRect(game.bombs[bomb]), "ink", rand, 6);
        game.bombs.splice(bomb, 1);
        return true;
      }
      return false;
    }),
  );
}

/* The game's layer over the world, and the screens between games: bombs, the
 * mystery ship, the score line, and the intro, pause and game-over panels.
 */

import { group } from "@/ui/format";
import { GLYPH_H, textWidth } from "../font";
import { bombRect, canRestart, HUD_Y, UFO_SIZE, UFO_Y, ufoRect, type Game } from "../game";
import type { Scene } from "../scene";
import type { ScenePalette } from "./palette";
import { cells, drawText, lit, panel } from "./pen";
import { drawScene } from "./scene";
import { BOMB, LIFE, UFO } from "./sprites";

/** How the screens between plays are worded: by keyboard, or by touch. */
export type Pointer = "keys" | "touch";

/** The attract scene, waiting for a player who has picked up the controls. */
export function drawReady(ctx: CanvasRenderingContext2D, scene: Scene, palette: ScenePalette, s: number, still: boolean): void {
  if (scene.invaders.length === 0) return;
  panel(ctx, scene, palette, s, [
    { text: "PLAYER 1", color: palette.bitcoin },
    { text: "PRESS SPACE / TAP TO START", color: lit(scene.time, still) ? palette.ink : palette.bg },
  ]);
}

/** The game: the world, then bombs, the mystery ship, the score line, and whatever screen the phase calls for. */
export function drawGame(ctx: CanvasRenderingContext2D, game: Game, palette: ScenePalette, s: number, pointer: Pointer): void {
  const scene = game.scene;
  const t = scene.time;
  const phase = game.phase.kind === "paused" ? game.phase.resume : game.phase;
  const cannon = phase.kind === "dying" || game.phase.kind === "over" ? "hide" : t < game.safeUntil ? "blink" : "show";
  drawScene(ctx, scene, palette, s, { hovered: -1, cannon, ceiling: HUD_Y + GLYPH_H + 3 });

  const bombFrame = Math.floor(t / 90) % 2;
  for (const bomb of game.bombs) {
    const r = bombRect(bomb);
    cells(ctx, BOMB[bombFrame], r.x, r.y, s, () => palette.invaders[bomb.spec].base);
  }

  if (game.ufo) {
    const r = ufoRect(game.ufo);
    const lights = Math.floor(t / 120) % 3;
    cells(ctx, UFO, r.x, r.y, s, () => palette.bitcoin);
    // The rim lights chase round, one in three dark.
    ctx.fillStyle = palette.bg;
    for (let x = 1 + lights; x < UFO_SIZE.w; x += 3) ctx.fillRect((r.x + x) * s, (r.y + 3) * s, s, s);
    const text = `BLOCK ${group(game.ufo.block)}`;
    const cx = Math.min(scene.right - textWidth(text) / 2, Math.max(scene.left + textWidth(text) / 2, r.x + UFO_SIZE.w / 2));
    drawText(ctx, text, Math.round(cx - textWidth(text) / 2), UFO_Y + UFO_SIZE.h + 2, s, palette.dim);
  }

  drawHud(ctx, game, palette, s);

  switch (game.phase.kind) {
    case "intro":
      panel(ctx, scene, palette, s, [
        { text: `WAVE ${game.wave}`, color: palette.bitcoin, scale: 2 },
        { text: "SCORE = TOKENS YOUR HASHES MINT", color: palette.dim },
      ]);
      break;
    case "paused":
      panel(ctx, scene, palette, s, [
        { text: "PAUSED", color: palette.ink, scale: 2 },
        { text: pointer === "touch" ? "TAP TO RESUME" : "P TO RESUME", color: palette.dim },
      ]);
      break;
    case "over": {
      const ready = canRestart(game);
      panel(ctx, scene, palette, s, [
        game.phase.cause === "invaded" ? { text: "THEY LANDED", color: palette.dim } : null,
        { text: "GAME OVER", color: palette.ink, scale: 2 },
        { text: `SCORE ${group(game.score)}`, color: palette.bitcoin },
        game.phase.record && lit(t, false) ? { text: "NEW HI-SCORE!", color: palette.bitcoin } : { text: `HI ${group(game.hi)}`, color: palette.dim },
        ready && lit(t, false) ? { text: "INSERT COIN", color: palette.ink } : { text: " ", color: palette.bg },
        ready ? { text: pointer === "touch" ? "TAP TO PLAY AGAIN" : "PRESS ENTER", color: palette.dim } : { text: " ", color: palette.bg },
      ]);
      break;
    }
    default:
      break;
  }
}

function drawHud(ctx: CanvasRenderingContext2D, game: Game, palette: ScenePalette, s: number): void {
  const { left, right } = game.scene;
  const y = HUD_Y;
  drawText(ctx, "SCORE", left, y, s, palette.dim);
  drawText(ctx, group(game.score), left + textWidth("SCORE ") + 1, y, s, palette.ink);

  const hi = group(game.hi);
  const hiWidth = textWidth(`HI ${hi}`);
  const hx = Math.round((left + right - hiWidth) / 2);
  drawText(ctx, "HI", hx, y, s, palette.bitcoin);
  drawText(ctx, hi, hx + textWidth("HI ") + 1, y, s, palette.ink);

  const lifeW = LIFE[0].length;
  let x = right - lifeW;
  for (let i = 0; i < game.lives; i++) {
    cells(ctx, LIFE, x, y + 1, s, () => palette.bitcoin);
    x -= lifeW + 2;
  }
  const wave = `W${game.wave}`;
  drawText(ctx, wave, x - textWidth(wave) + lifeW - 2, y, s, palette.dim);
}

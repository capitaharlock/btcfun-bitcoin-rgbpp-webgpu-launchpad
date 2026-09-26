/* The world both modes share, composed into a frame: sky, cover, the
 * formation, hashes in flight, the cannon, debris and floating scores.
 */

import { GLYPH_H } from "../font";
import { alive, CANNON, cannonY, groundY, invaderRect, SPRITE_W } from "../scene/geometry";
import { CANNON_SIZE, TIMING, type Scene } from "../scene";
import { tint, type ScenePalette } from "./palette";
import { cells, drawText, fade, label } from "./pen";

/** Rows at the top the page's own HUD is printed over in the attract mode. */
const HUD_CELLS = 14;

export interface WorldView {
  /** Invader under the pointer, to name it; -1 for none. */
  hovered: number;
  cannon: "show" | "blink" | "hide";
  /** Highest row a floating score may rise to. */
  ceiling: number;
}

/** The world both modes share: sky, cover, the formation, hashes, the cannon, debris and scores. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  palette: ScenePalette,
  s: number,
  view: WorldView = { hovered: -1, cannon: "show", ceiling: HUD_CELLS },
): void {
  const t = scene.time;
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, scene.width * s, scene.height * s);

  // Stars: three depths, the nearest twinkling.
  scene.stars.forEach((star, i) => {
    if (star.layer === 2 && Math.floor(t / 180 + i) % 7 === 0) return;
    ctx.fillStyle = star.layer === 0 ? palette.faint : star.layer === 1 ? palette.dim : palette.ink;
    ctx.fillRect(star.x * s, Math.floor(star.y) * s, s, s);
  });

  // Ground.
  ctx.fillStyle = palette.cover;
  ctx.fillRect(scene.left * s, groundY(scene) * s, (scene.right - scene.left) * s, s);

  for (const bunker of scene.bunkers) {
    ctx.fillStyle = palette.cover;
    bunker.cells.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) ctx.fillRect((bunker.x + x) * s, (bunker.y + y) * s, s, s);
      }),
    );
  }

  const frame = scene.formation.frame;
  scene.invaders.forEach((inv) => {
    if (!alive(inv, t)) return;
    const r = invaderRect(scene, inv);
    const colours = palette.invaders[inv.spec];
    const flashing = inv.flashUntil > t && Math.floor(t / 80) % 2 === 0;
    cells(ctx, scene.specs[inv.spec].frames[frame], r.x, r.y, s, (cell) =>
      flashing ? palette.ink : cell === 2 ? colours.hi : colours.base,
    );
  });

  // A hash leaves the barrel rather than appearing whole above it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, scene.width * s, cannonY(scene) * s);
  ctx.clip();
  for (const shot of scene.shots) {
    [...shot.text].forEach((ch, i) => {
      drawText(ctx, ch, shot.x, Math.round(shot.y) + i * (GLYPH_H + 1), s, i < shot.zeros ? palette.bitcoin : palette.dim);
    });
  }
  ctx.restore();

  if (view.cannon === "show" || (view.cannon === "blink" && Math.floor(t / 100) % 2 === 0)) {
    cells(ctx, CANNON, Math.round(scene.cannon.x - CANNON_SIZE.w / 2), cannonY(scene), s, () => palette.bitcoin);
  }

  for (const p of scene.particles) {
    ctx.globalAlpha = fade(t - p.born, TIMING.PARTICLE_MS);
    ctx.fillStyle = tint(palette, p.tint);
    ctx.fillRect(Math.round(p.x) * s, Math.round(p.y) * s, s, s);
  }

  for (const p of scene.popups) {
    const age = t - p.born;
    ctx.globalAlpha = fade(age, TIMING.POPUP_MS);
    const rise = Math.floor((age / TIMING.POPUP_MS) * 12);
    label(ctx, p.text, p.x, Math.max(view.ceiling, Math.round(p.y - 8 - rise)), s, tint(palette, p.tint), palette.bg);
  }
  ctx.globalAlpha = 1;

  const hovered = scene.invaders[view.hovered];
  if (hovered && alive(hovered, t)) {
    const r = invaderRect(scene, hovered);
    label(ctx, scene.specs[hovered.spec].symbol, r.x + SPRITE_W / 2, r.y + r.h + 2, s, palette.ink, palette.bg);
  }

  if (scene.invaders.length === 0 && Math.floor(t / 600) % 2 === 0) {
    label(ctx, "AWAITING PLAYERS", (scene.left + scene.right) / 2, Math.round(scene.height / 2 - 12), s, palette.dim, palette.bg);
  }
}

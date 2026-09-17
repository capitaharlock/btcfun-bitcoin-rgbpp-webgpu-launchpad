/* Drawing the arcade scene onto a canvas.
 *
 * Everything is filled rectangles on an integer grid: one scene cell is `s`
 * device pixels, so every pixel of every sprite, glyph and particle lands on
 * whole device pixels and stays square at any zoom. Colours arrive resolved
 * from the theme's tokens (`ArcadeScene.tsx`); nothing here names one.
 */

import type { PixelGrid } from "../pixels";
import { ADVANCE, glyph, GLYPH_H, textWidth } from "./font";
import {
  alive,
  CANNON_SIZE,
  cannonY,
  groundY,
  invaderRect,
  SPRITE_W,
  TIMING,
  type Scene,
} from "./scene";

export interface ScenePalette {
  bg: string;
  ink: string;
  dim: string;
  faint: string;
  /** The cannon, and the zeros of every hash: Bitcoin's colour. */
  bitcoin: string;
  /** Bunkers and the ground. */
  cover: string;
  /** Per launch, in scene order: its accent and the accent's highlight. */
  invaders: ReadonlyArray<{ base: string; hi: string }>;
}

/** The ₿ cannon: a barrel on a body, with the coin's letter cut out of it. */
const CANNON: PixelGrid = (() => {
  const { w, h } = CANNON_SIZE;
  const rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const mid = Math.floor(w / 2);
      if (y === 0) return x === mid ? 1 : 0;
      if (y < 3) return Math.abs(x - mid) <= 1 ? 1 : 0;
      if (y === 3) return x > 0 && x < w - 1 ? 1 : 0;
      return 1;
    }),
  );
  // The B, and the two strokes through it that make it ₿.
  const b = glyph("B");
  const left = Math.floor(w / 2) - 1;
  b.forEach((row, gy) => row.forEach((on, gx) => {
    if (on) rows[4 + gy][left + gx] = 0;
  }));
  rows[3][left] = 0;
  rows[3][left + 1] = 0;
  rows[h - 1][left] = 0;
  rows[h - 1][left + 1] = 0;
  return rows;
})();

function cells(ctx: CanvasRenderingContext2D, grid: PixelGrid, x: number, y: number, s: number, color: (cell: number) => string | null): void {
  grid.forEach((row, gy) =>
    row.forEach((cell, gx) => {
      if (!cell) return;
      const fill = color(cell);
      if (!fill) return;
      ctx.fillStyle = fill;
      ctx.fillRect((x + gx) * s, (y + gy) * s, s, s);
    }),
  );
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  [...text].forEach((ch, i) => {
    glyph(ch).forEach((row, gy) =>
      row.forEach((on, gx) => {
        if (on) ctx.fillRect((x + i * ADVANCE + gx) * s, (y + gy) * s, s, s);
      }),
    );
  });
}

/** Text on a solid plate of the background colour, so it reads cleanly over
 *  stars and sprites alike — the way an arcade prints a score over the play. */
function label(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, s: number, color: string, bg: string): void {
  const x = Math.round(cx - textWidth(text) / 2);
  ctx.fillStyle = bg;
  ctx.fillRect((x - 1) * s, (y - 1) * s, (textWidth(text) + 2) * s, (GLYPH_H + 2) * s);
  drawText(ctx, text, x, y, s, color);
}

/** Rows at the top the HUD is printed over. */
const HUD_CELLS = 14;

/** Quantised fade: four steps of alpha, like a palette-limited fade-out. */
function fade(age: number, life: number): number {
  return Math.max(0, Math.ceil((1 - age / life) * 4) / 4);
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  palette: ScenePalette,
  s: number,
  hovered: number,
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

  for (const shot of scene.shots) {
    [...shot.text].forEach((ch, i) => {
      drawText(ctx, ch, shot.x, Math.round(shot.y) + i * (GLYPH_H + 1), s, i < shot.zeros ? palette.bitcoin : palette.dim);
    });
  }

  const cannon = scene.cannon;
  cells(ctx, CANNON, Math.round(cannon.x - CANNON_SIZE.w / 2), cannonY(scene), s, () => palette.bitcoin);

  for (const p of scene.particles) {
    ctx.globalAlpha = fade(t - p.born, TIMING.PARTICLE_MS);
    ctx.fillStyle = p.spec < 0 ? palette.ink : palette.invaders[p.spec].base;
    ctx.fillRect(Math.round(p.x) * s, Math.round(p.y) * s, s, s);
  }

  for (const p of scene.popups) {
    const age = t - p.born;
    ctx.globalAlpha = fade(age, TIMING.POPUP_MS);
    const rise = Math.floor((age / TIMING.POPUP_MS) * 12);
    // Never up into the HUD band at the top of the screen.
    label(ctx, p.text, p.x, Math.max(HUD_CELLS, Math.round(p.y - 8 - rise)), s, palette.invaders[p.spec].base, palette.bg);
  }
  ctx.globalAlpha = 1;

  if (hovered >= 0 && scene.invaders[hovered] && alive(scene.invaders[hovered], t)) {
    const inv = scene.invaders[hovered];
    const r = invaderRect(scene, inv);
    label(ctx, scene.specs[inv.spec].symbol, r.x + SPRITE_W / 2, r.y + r.h + 2, s, palette.ink, palette.bg);
  }

  if (scene.invaders.length === 0 && Math.floor(t / 600) % 2 === 0) {
    label(ctx, "AWAITING PLAYERS", (scene.left + scene.right) / 2, Math.round(scene.height / 2 - 12), s, palette.dim, palette.bg);
  }
}

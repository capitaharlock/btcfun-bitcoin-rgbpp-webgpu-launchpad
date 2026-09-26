/* The pen: how anything gets onto the canvas. Everything is filled rectangles
 * on an integer grid — one scene cell is `s` device pixels — so every pixel of
 * every sprite, glyph and particle lands on whole device pixels and stays
 * square at any zoom. Sprites, text, labels on a plate, a framed panel of
 * lines, and the quantised fades and blinks the screens share.
 */

import type { PixelGrid } from "@/ui/pixels/pixels";
import { ADVANCE, glyph, GLYPH_H, textWidth } from "../font";
import type { Scene } from "../scene";
import type { ScenePalette } from "./palette";

export function cells(ctx: CanvasRenderingContext2D, grid: PixelGrid, x: number, y: number, s: number, color: (cell: number) => string | null): void {
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

/** A line of text in the pixel font; `scale` makes each glyph cell a block of cells. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, color: string, scale = 1): void {
  ctx.fillStyle = color;
  const k = s * scale;
  [...text].forEach((ch, i) => {
    glyph(ch).forEach((row, gy) =>
      row.forEach((on, gx) => {
        if (on) ctx.fillRect(x * s + (i * ADVANCE + gx) * k, y * s + gy * k, k, k);
      }),
    );
  });
}

/** Text on a solid plate of the background colour, so it reads cleanly over
 *  stars and sprites alike — the way an arcade prints a score over the play. */
export function label(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, s: number, color: string, bg: string, scale = 1): void {
  const w = textWidth(text) * scale;
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = bg;
  ctx.fillRect((x - 1) * s, (y - 1) * s, (w + 2) * s, (GLYPH_H * scale + 2) * s);
  drawText(ctx, text, x, y, s, color, scale);
}

/** Quantised fade: four steps of alpha, like a palette-limited fade-out. */
export function fade(age: number, life: number): number {
  return Math.max(0, Math.ceil((1 - age / life) * 4) / 4);
}

/** Whether a blinking line is lit now: steady when motion is reduced. */
export function lit(t: number, still: boolean): boolean {
  return still || Math.floor(t / 500) % 2 === 0;
}

/** A framed panel of centred lines in the middle of the playfield. */
export function panel(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  palette: ScenePalette,
  s: number,
  lines: ReadonlyArray<{ text: string; color: string; scale?: number } | null>,
): void {
  const shown = lines.filter((l): l is { text: string; color: string; scale?: number } => l !== null);
  const gap = 4;
  const height = shown.reduce((h, l) => h + GLYPH_H * (l.scale ?? 1) + gap, -gap);
  const width = Math.max(...shown.map((l) => textWidth(l.text) * (l.scale ?? 1)));
  const cx = (scene.left + scene.right) / 2;
  const top = Math.round(scene.height * 0.46 - height / 2);
  const pad = 6;
  const x0 = Math.round(cx - width / 2 - pad);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.cover;
  ctx.fillRect((x0 - 1) * s, (top - pad - 1) * s, (width + 2 * pad + 2) * s, (height + 2 * pad + 2) * s);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(x0 * s, (top - pad) * s, (width + 2 * pad) * s, (height + 2 * pad) * s);
  let y = top;
  for (const line of shown) {
    const scale = line.scale ?? 1;
    drawText(ctx, line.text, Math.round(cx - (textWidth(line.text) * scale) / 2), y, s, line.color, scale);
    y += GLYPH_H * scale + gap;
  }
}

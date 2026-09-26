/* Where things are in the scene: sprite and formation pitch, the ground, the
 * cannon's row and sprite, how many columns a formation takes, and which
 * invader is under a point. Units are virtual pixels, one sprite cell each. */

import type { PixelGrid } from "@/ui/pixels/pixels";
import { glyph } from "../font";
import type { Formation, Invader, Rect, Scene } from "./types";

export const SPRITE_W = 11;
export const SPRITE_H = 8;
/** Formation pitch: a sprite plus the gutter around it. */
export const CELL_W = SPRITE_W + 9;
export const CELL_H = SPRITE_H + 8;
/** Where the formation starts: a fifth of the way down, clear of the HUD. */
export function formationTop(height: number): number {
  return Math.max(14, Math.round(height * 0.22));
}
/** Cells the formation moves per step, and drops at an edge. */
export const STEP_X = 2;
export const STEP_Y = 5;
export const STEP_MS = 420;

export const CANNON_W = 13;
export const CANNON_H = 10;

/** The ₿ cannon: a barrel on a body, with the coin's letter cut out of it. */
export const CANNON: PixelGrid = (() => {
  const w = CANNON_W;
  const h = CANNON_H;
  const mid = Math.floor(w / 2);
  const rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      if (y === 0) return x === mid ? 1 : 0;
      if (y < 3) return Math.abs(x - mid) <= 1 ? 1 : 0;
      if (y === 3) return x > 0 && x < w - 1 ? 1 : 0;
      return 1;
    }),
  );
  // The B, and the two strokes through it that make it ₿.
  const left = mid - 1;
  glyph("B").forEach((row, gy) =>
    row.forEach((on, gx) => {
      if (on) rows[4 + gy][left + gx] = 0;
    }),
  );
  rows[3][left] = 0;
  rows[3][left + 1] = 0;
  rows[h - 1][left] = 0;
  rows[h - 1][left + 1] = 0;
  return rows;
})();

export function groundY(scene: Pick<Scene, "height">): number {
  return scene.height - 3;
}

export function cannonY(scene: Pick<Scene, "height">): number {
  return groundY(scene) - CANNON_H - 1;
}

/** Most invaders in a row: past this a formation reads better as more rows. */
const ROW_MAX = 6;

/** Columns that fit the playfield, leaving room to march, in balanced rows. */
export function columnsFor(count: number, span: number): number {
  const fit = Math.max(1, Math.floor((span - 4 * STEP_X * 4) / CELL_W));
  const cap = Math.min(fit, ROW_MAX);
  const rows = Math.max(1, Math.ceil(count / cap));
  return Math.max(1, Math.min(cap, Math.ceil(count / rows)));
}

export function formationWidth(f: Pick<Formation, "cols" | "pitchX">): number {
  return (f.cols - 1) * f.pitchX + SPRITE_W;
}

export function formationHeight(f: Pick<Formation, "rows" | "pitchY">): number {
  return (f.rows - 1) * f.pitchY + SPRITE_H;
}

/** Where an invader is drawn, whether or not it is alive. */
export function invaderRect(scene: Pick<Scene, "formation">, invader: Pick<Invader, "col" | "row">): Rect {
  const f = scene.formation;
  return { x: f.x + invader.col * f.pitchX, y: f.y + invader.row * f.pitchY, w: SPRITE_W, h: SPRITE_H };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

export function alive(invader: Invader, time: number): boolean {
  return invader.deadUntil <= time;
}

/** The live invader at a point, or -1. */
export function invaderAt(scene: Scene, x: number, y: number): number {
  return scene.invaders.findIndex((inv) => alive(inv, scene.time) && contains(invaderRect(scene, inv), x, y));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

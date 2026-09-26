/* The playfield and the formation on it: how wide the field is on a screen,
 * how many invaders a wave holds, where they start, and how fast they march
 * as the wave thins.
 */

import { alive, clamp, formationHeight, SPRITE_H, SPRITE_W, STEP_Y } from "../scene/geometry";
import { type Formation, type Invader, type Scene, type SceneBounds } from "../scene";
import { freshBunker, bunkerY } from "../scene/bunker";
import { BASE_STEP_MS, COLS_MAX, FIELD_MAX, GAME_TOP, INTRO_MS, MARCH_ROOM, MIN_STEP_MS, PITCH_X, PITCH_Y, ROWS_MAX } from "./constants";
import type { Game } from "./types";

/** The playfield for a screen `width` cells wide: centred, and no wider than the cabinet's. */
export function gameBounds(width: number, height: number): SceneBounds {
  const span = Math.min(FIELD_MAX, width - 8);
  const left = Math.floor((width - span) / 2);
  return { width, height, left, right: left + span };
}

/** Columns and rows of a wave's formation on a playfield. */
export function waveGrid(scene: Pick<Scene, "left" | "right" | "height">): { cols: number; rows: number } {
  const span = scene.right - scene.left;
  const cols = clamp(Math.floor((span - MARCH_ROOM - SPRITE_W) / PITCH_X) + 1, 1, COLS_MAX);
  const room = bunkerY(scene) - 2 * STEP_Y - GAME_TOP - SPRITE_H;
  const rows = clamp(Math.floor(room / PITCH_Y) + 1, 1, ROWS_MAX);
  return { cols, rows };
}

/**
 * A wave's formation: one launch per row, rotating through the catalogue wave
 * by wave so every launch takes its turn. Each wave starts one drop lower, as
 * far as leaves two drops before the cover.
 */
export function arrangeWave(scene: Scene, wave: number): void {
  const { cols, rows } = waveGrid(scene);
  const n = scene.specs.length;
  const formation: Formation = {
    x: 0,
    y: GAME_TOP,
    dir: 1,
    frame: 0,
    next: scene.time + INTRO_MS,
    cols,
    rows,
    pitchX: PITCH_X,
    pitchY: PITCH_Y,
  };
  const lowest = bunkerY(scene) - 2 * STEP_Y - formationHeight(formation);
  formation.y = Math.max(GAME_TOP, Math.min(GAME_TOP + (wave - 1) * STEP_Y, lowest));
  formation.x = Math.round((scene.left + scene.right - (cols - 1) * PITCH_X - SPRITE_W) / 2);
  scene.formation = formation;
  scene.invaders = [];
  for (let row = 0; row < rows; row++) {
    const spec = (row + (wave - 1) * rows) % n;
    for (let col = 0; col < cols; col++) scene.invaders.push({ spec, col, row, deadUntil: 0, flashUntil: 0 });
  }
  scene.shots = [];
  for (const bunker of scene.bunkers) bunker.cells = freshBunker();
}

export function living(scene: Scene): Invader[] {
  return scene.invaders.filter((inv) => alive(inv, scene.time));
}

/** Milliseconds between march steps: the fewer invaders left, and the later the wave, the faster. */
export function marchInterval(game: Pick<Game, "wave" | "total">, remaining: number): number {
  const base = Math.max(160, BASE_STEP_MS * 0.86 ** (game.wave - 1));
  const share = game.total > 1 ? (remaining - 1) / (game.total - 1) : 0;
  return MIN_STEP_MS + (base - MIN_STEP_MS) * clamp(share, 0, 1);
}

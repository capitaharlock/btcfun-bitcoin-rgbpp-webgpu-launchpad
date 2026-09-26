/* The game's numbers: the playfield, the formation's pitch, speeds, sizes and
 * the timings of its phases. Tuned against the original cabinet and kept in
 * one place so a rule reads as a rule, not as arithmetic.
 */

import { SPRITE_H, SPRITE_W } from "../scene/geometry";

/** One and a half of the original cabinet's playfield, in cells: an open stage fills a wide screen, and wider still would only make the cannon slower to cross. */
export const FIELD_MAX = 336;
/** Rows above the formation: the score line, the mystery ship's lane and its label. */
export const HUD_Y = 2;
export const UFO_Y = 11;
export const GAME_TOP = 26;

export const PITCH_X = SPRITE_W + 5;
export const PITCH_Y = SPRITE_H + 5;
export const COLS_MAX = 11;
export const ROWS_MAX = 5;
/** Room left beside the formation to march in. */
export const MARCH_ROOM = 32;

export const LIVES = 3;
export const MAX_LIVES = 5;
/** A life is added each time the score passes a multiple of this. */
export const EXTRA_LIFE_EVERY = 20_000;

export const PLAYER_SPEED = 0.075; // cells per ms
export const SHOT_SPEED = 0.3;
export const BOMB_W = 3;
export const BOMB_H = 6;
export const BOMB_SPEED = 0.042;
export const UFO_W = 16;
export const UFO_H = 7;
export const UFO_SPEED = 0.04;
/** The mystery ship only flies while this many invaders remain, as in the original. */
export const UFO_MIN_INVADERS = 8;
export const UFO_BONUSES = [1_000, 2_000, 3_000, 5_000] as const;

/** The march's pace: `BASE_STEP_MS` for a full first wave, down to `MIN_STEP_MS` for the last invader. */
export const BASE_STEP_MS = 480;
export const MIN_STEP_MS = 30;
export const INTRO_MS = 1_800;
export const DYING_MS = 1_500;
export const SAFE_MS = 2_000;
/** Game over holds this long before a key can start another, so a held Space does not skip it. */
export const OVER_HOLD_MS = 900;

export const GAME_TIMING = { INTRO_MS, DYING_MS, SAFE_MS, OVER_HOLD_MS } as const;
export const BOMB_SIZE = { w: BOMB_W, h: BOMB_H } as const;
export const UFO_SIZE = { w: UFO_W, h: UFO_H } as const;

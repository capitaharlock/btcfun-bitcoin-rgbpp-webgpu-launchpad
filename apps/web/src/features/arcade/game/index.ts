/* The playable game, as data and rules — no canvas, no clock, no keyboard.
 *
 * The same world as the attract mode (`scene/`) under the rules of the
 * original cabinet: a formation that marches faster as it thins, bombs, cover
 * that wears away from both sides, three lives, waves that start lower, and a
 * mystery ship across the top. What stays this product's own: every invader is
 * a real launch, the cannon fires hashes, and a hit scores the whole tokens
 * that hash would mint on that launch today — `reward()` at its current
 * halving. The mystery ship is the next Bitcoin block, labelled with its
 * height, and pays a flat bonus.
 *
 * One file per concern: `constants` and `types`; `field` (the playfield and
 * the formation), `cannon`, `bombs`, `shots`, `ufo`, `waves` (the rules that
 * move things); `scoring`; `phase` (pause and restart); `step` (a game's
 * creation and its clock). This index is the public face the cabinet, the
 * drawing and the tests import.
 */

export { bombRect } from "./bombs";
export { hitsCannon } from "./cannon";
export { BOMB_SIZE, EXTRA_LIFE_EVERY, FIELD_MAX, GAME_TIMING, GAME_TOP, HUD_Y, LIVES, OVER_HOLD_MS, UFO_SIZE, UFO_Y } from "./constants";
export { arrangeWave, gameBounds, living, marchInterval, waveGrid } from "./field";
export { canRestart, pause, togglePause } from "./phase";
export { createGame, stepGame } from "./step";
export { IDLE } from "./types";
export type { Bomb, Cause, Controls, Game, GameEvent, Phase, Running, Ufo } from "./types";
export { ufoRect } from "./ufo";

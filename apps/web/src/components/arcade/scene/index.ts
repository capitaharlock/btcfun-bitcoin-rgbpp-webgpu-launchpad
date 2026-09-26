/* The front page's arcade scene, as data and rules — no canvas, no clock.
 *
 * The metaphor is the product: every invader is a real launch, drawn as its
 * own sprite; the cannon is Bitcoin, and what it fires are hashes; a hit
 * scores what a hash of that strength would mint on that launch today.
 *
 * This module is the world both modes share — the formation, the bunkers, a
 * hash in flight, an explosion — and the attract mode's rules: `stepScene`
 * plays itself, endlessly, and nobody loses. The playable rules (lives, bombs,
 * waves) are `game.ts`, built from the same pieces. Everything advances by a
 * time step with an injected random source, so it is deterministic under test
 * and the reduced-motion still frame is the same picture on every load.
 *
 * Units are virtual pixels — one cell of a sprite — and milliseconds.
 *
 * The module's parts: `types.ts` (the world as data), `geometry.ts` (where
 * things are), `bunker.ts` (erodible cover), `shots.ts` (hashes in flight)
 * and `step.ts` (building and advancing the attract scene). This file is its
 * public face.
 */

import { BUNKER_H, BUNKER_W } from "./bunker";
import { CANNON_H, CANNON_W } from "./geometry";
import { CLZ_MAX, CLZ_MIN } from "./shots";
import { FLASH_MS, PARTICLE_MS, POPUP_MS, RESPAWN_MS } from "./step";

export { seeded } from "../../../lib/random";
export type * from "./types";
export {
  alive,
  CANNON,
  cannonY,
  CELL_H,
  CELL_W,
  clamp,
  columnsFor,
  contains,
  formationHeight,
  formationTop,
  formationWidth,
  groundY,
  invaderAt,
  invaderRect,
  SPRITE_H,
  SPRITE_W,
  STEP_MS,
  STEP_X,
  STEP_Y,
} from "./geometry";
export { bunkerY, erode, freshBunker, placeBunkers, scour } from "./bunker";
export { drawClz, flyShot, shotHash, shotLength, sweep } from "./shots";
export { burst, createScene, explode, rewardText, stepEffects, stepFormation, stepScene, stepStars } from "./step";

export const TIMING = { POPUP_MS, PARTICLE_MS, FLASH_MS, RESPAWN_MS } as const;
export const CANNON_SIZE = { w: CANNON_W, h: CANNON_H } as const;
export const BUNKER_SIZE = { w: BUNKER_W, h: BUNKER_H } as const;
export const CLZ_RANGE = { min: CLZ_MIN, max: CLZ_MAX } as const;

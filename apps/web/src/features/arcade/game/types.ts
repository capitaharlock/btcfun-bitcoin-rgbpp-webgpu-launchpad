/* The game as data: the player's controls, where a game is, what a step did
 * that a player would hear, and the state the rules advance.
 */

import type { Scene } from "../scene";

export interface Controls {
  left: boolean;
  right: boolean;
  fire: boolean;
  /** Cell a finger wants the cannon under, or null without one. */
  aim: number | null;
}

export const IDLE: Controls = { left: false, right: false, fire: false, aim: null };

export type Cause = "shot" | "invaded";

/** Where a game is. Paused holds the moment it interrupted; a game over cannot pause. */
export type Phase =
  | { kind: "intro"; until: number }
  | { kind: "playing" }
  | { kind: "dying"; until: number; cause: Cause }
  | { kind: "over"; at: number; cause: Cause; record: boolean }
  | { kind: "paused"; resume: Running };

export type Running = Extract<Phase, { kind: "intro" | "playing" | "dying" }>;

/** What a step did that a player would hear. */
export type GameEvent =
  | { kind: "march"; beat: number }
  | { kind: "fire" | "hit" | "ufo" | "ufoHit" | "playerHit" | "wave" | "extraLife" | "over" };

export interface Bomb {
  x: number;
  y: number;
  /** The launch that dropped it, for its colour. */
  spec: number;
}

export interface Ufo {
  x: number;
  dir: 1 | -1;
  /** The block height it is labelled with. */
  block: number;
  bonus: number;
}

export interface Game {
  scene: Scene;
  phase: Phase;
  score: number;
  hi: number;
  /** The hi-score this game started against: beating it is a record. */
  best: number;
  lives: number;
  wave: number;
  /** Invaders the wave started with: the march speeds up as they fall. */
  total: number;
  bombs: Bomb[];
  ufo: Ufo | null;
  nextBomb: number;
  nextUfo: number;
  /** The cannon cannot be hit until this time after a respawn. */
  safeUntil: number;
  /** Score at which the next extra life is due. */
  nextLife: number;
  /** The four-note march: which note the next step plays. */
  beat: number;
  /** The next Bitcoin block's height, kept current by the caller. */
  block: number;
  /** What happened since the caller last drained this. */
  events: GameEvent[];
}

/* The arcade scene's shapes: the world as plain data — formation, invaders,
 * hashes in flight, debris, bunkers, sky — so the rules (`step.ts`, `game.ts`)
 * and the painter (`draw.ts`) share one description of it. */

import type { PixelGrid } from "../../../lib/pixels/pixels";

export type Rand = () => number;

/** One launch as the scene needs it. */
export interface InvaderSpec {
  id: string;
  symbol: string;
  /** The two frames of its sprite (`pixelSigil`). */
  frames: readonly [PixelGrid, PixelGrid];
  /** Whole tokens a hash of `clz` leading zero bits mints on it now. */
  reward: (clz: number) => number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Formation {
  x: number;
  y: number;
  dir: 1 | -1;
  /** Which sprite frame is showing; flips on every step. */
  frame: 0 | 1;
  /** Time of the next step. */
  next: number;
  cols: number;
  rows: number;
  /** Distance between neighbouring sprites' origins. */
  pitchX: number;
  pitchY: number;
}

export interface Invader {
  spec: number;
  col: number;
  row: number;
  /** Dead until this time; alive when in the past. `Infinity` is for good. */
  deadUntil: number;
  /** Flashes white until this time after respawning. */
  flashUntil: number;
}

export interface Shot {
  x: number;
  y: number;
  /** The hash it carries, leading zeros first. */
  text: string;
  zeros: number;
  clz: number;
}

/** A colour by meaning: a launch's (its index), the text colour, or Bitcoin's. */
export type Tint = number | "ink" | "bitcoin";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  tint: Tint;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  tint: Tint;
  born: number;
}

export interface Bunker {
  x: number;
  y: number;
  cells: boolean[][];
}

export interface Star {
  x: number;
  y: number;
  /** Cells per ms: nearer stars fall faster. */
  speed: number;
  layer: 0 | 1 | 2;
}

export interface Cannon {
  x: number;
  target: number;
  lastShot: number;
}

export interface Scene {
  width: number;
  height: number;
  /** Horizontal span the formation and the cannon use; the rest is sky. */
  left: number;
  right: number;
  time: number;
  specs: readonly InvaderSpec[];
  formation: Formation;
  invaders: Invader[];
  shots: Shot[];
  particles: Particle[];
  popups: Popup[];
  bunkers: Bunker[];
  stars: Star[];
  cannon: Cannon;
  /** Hits so far: the scene's own score, shown nowhere essential. */
  hits: number;
}

export interface SceneBounds {
  width: number;
  height: number;
  left: number;
  right: number;
}

/** How a formation marches: its pace, which columns and rows still count, and what happens at the bottom. */
export interface March {
  interval: number;
  /** First and last column with a live invader: the edges the formation turns at. */
  cols: readonly [number, number];
  /** Last row with a live invader. */
  bottom: number;
  /** Start again at the top on nearing the bunkers — the attract mode's rule, where nobody loses. */
  wrap: boolean;
}

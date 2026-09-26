/* The cabinet's shared state: one mutable object the clock, the keyboard and
 * the pointer all read and write, in place of the variables one long closure
 * used to hold. Passing it explicitly keeps each part of the cabinet in its
 * own file while every part still sees the same, current values.
 */

import type { Pointer, ScenePalette } from "../draw";
import type { Game } from "../game";
import type { InvaderSpec, Scene } from "../scene";
import type { Sound } from "../sound";

export interface Roster {
  specs: InvaderSpec[];
  palette: ScenePalette;
}

/** What the page shows about the cabinet outside the canvas. */
export interface Hud {
  mode: "attract" | "ready" | "playing" | "paused" | "over";
  score: number;
  hi: number;
  lives: number;
  wave: number;
}

export const ATTRACT_HUD: Hud = { mode: "attract", score: 0, hi: 0, lives: 0, wave: 0 };

export interface CabinetOptions {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  reduced: boolean;
  /** The launches as invaders, with their colours: read afresh when the scene is rebuilt. */
  roster(): Roster;
  /** The height the next Bitcoin block will have. */
  nextBlock(): number;
  /** A launch was clicked in the attract mode. */
  pick(spec: InvaderSpec): void;
  report(hud: Hud): void;
  /** The player left for the attract mode and the canvas let go of the focus: the page says where it goes. */
  exited(): void;
  sound: Sound;
}

export type State =
  | { mode: "attract" | "ready"; scene: Scene; palette: ScenePalette }
  | { mode: "game"; game: Game; palette: ScenePalette; saved: boolean };

export interface Rig {
  o: CabinetOptions;
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  reduced: boolean;
  state: State;
  /** Device pixels per cell, and where the scene's origin sits on the canvas. */
  s: number;
  ox: number;
  raf: number;
  last: number;
  pending: number;
  onScreen: boolean;
  hovered: number;
  pointer: Pointer;
  keys: { left: boolean; right: boolean; fire: boolean };
  /** A finger (or a held mouse button) steering the cannon during a game. */
  finger: { id: number; x: number } | null;
  /** A press of fire shorter than a frame still fires once: it waits here until a hash leaves. */
  fireQueued: boolean;
  /** The mode a press began in: a click that focused the canvas does not also start the game. */
  pressedIn: State["mode"] | null;
  reported: Hud;
  hi: number;
}

/** The rig before its first scene exists: everything measuring and building one needs. */
export type RigBase = Omit<Rig, "state">;

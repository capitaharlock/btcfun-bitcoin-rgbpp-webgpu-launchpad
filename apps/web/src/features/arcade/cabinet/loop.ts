/* The cabinet's clock and modes: sizing the canvas to its cell grid, the
 * fixed-step frame loop, drawing and reporting the HUD, and the moves between
 * attract, ready and game that the keyboard and the pointer both trigger.
 */

import { drawGame, drawReady, drawScene, type ScenePalette } from "../draw";
import { createGame, gameBounds, pause, stepGame, togglePause, type Controls, type Game } from "../game";
import { writeHiScore } from "../prefs";
import { createScene, stepScene } from "../scene/step";
import { seeded } from "@/ui/random";
import type { Scene } from "../scene";
import { ATTRACT_HUD, type Hud, type Rig, type RigBase } from "./rig";

/** CSS pixels per scene cell in the attract mode: chunkier on a large screen, finer on a phone. */
const CELL_CSS = { wide: 4, narrow: 3 } as const;
/** Width from which the scene uses the large cell. */
const WIDE = 900;
/** The strip along the bottom kept clear for the controls bar, in CSS px. */
export const BAR_CSS = 30;
/** Rows a game wants: the cell is as large as still fits about this many. */
const GAME_ROWS = 140;
/** How much time the still frame shows having passed. */
const STILL_MS = 2_600;
/** The rules' time step, and the most steps one frame may catch up. */
const STEP_MS = 1000 / 60;
const MAX_STEPS = 8;

export const dpr = () => window.devicePixelRatio || 1;

function size(rig: RigBase): { width: number; height: number } {
  const { width, height } = rig.host.getBoundingClientRect();
  rig.canvas.width = Math.max(1, Math.floor(width * dpr()));
  rig.canvas.height = Math.max(1, Math.floor(height * dpr()));
  return { width, height };
}

export function attractScene(rig: RigBase): { scene: Scene; palette: ScenePalette } {
  const { width } = size(rig);
  const wide = width >= WIDE;
  const cell = wide ? CELL_CSS.wide : CELL_CSS.narrow;
  rig.s = Math.max(1, Math.round(cell * dpr()));
  rig.ox = 0;
  const cols = Math.floor(rig.canvas.width / rig.s);
  const rows = Math.floor((rig.canvas.height - BAR_CSS * dpr()) / rig.s);
  const { specs, palette } = rig.o.roster();
  const scene = createScene(specs, { width: cols, height: rows, left: 4, right: cols - 4 }, seeded(7));
  if (rig.reduced) {
    const still = seeded(11);
    for (let t = 0; t < STILL_MS; t += 16) stepScene(scene, 16, still);
  }
  return { scene, palette };
}

/** A game keeps its grid on resize: the cell is refitted and the field centred. */
export function fitGame(rig: Rig, game: Game): void {
  size(rig);
  const room = rig.canvas.height - BAR_CSS * dpr();
  rig.s = Math.max(1, Math.floor(Math.min(rig.canvas.width / game.scene.width, room / game.scene.height)));
  rig.ox = Math.floor((rig.canvas.width - game.scene.width * rig.s) / 2);
}

export function draw(rig: Rig): void {
  const { ctx, canvas, state, s } = rig;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = state.palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(1, 0, 0, 1, rig.ox, 0);
  if (state.mode === "game") drawGame(ctx, state.game, state.palette, s, rig.pointer);
  else {
    drawScene(ctx, state.scene, state.palette, s, { hovered: rig.hovered, cannon: "show", ceiling: 14 });
    if (state.mode === "ready") drawReady(ctx, state.scene, state.palette, s, rig.reduced);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function report(rig: Rig): void {
  const { state } = rig;
  const hud: Hud =
    state.mode === "game"
      ? {
          mode:
            state.game.phase.kind === "paused" ? "paused" : state.game.phase.kind === "over" ? "over" : "playing",
          score: state.game.score,
          hi: state.game.hi,
          lives: state.game.lives,
          wave: state.game.wave,
        }
      : { ...ATTRACT_HUD, mode: state.mode, hi: rig.hi };
  const same = (Object.keys(hud) as Array<keyof Hud>).every((k) => hud[k] === rig.reported[k]);
  if (!same) rig.o.report((rig.reported = hud));
}

const controls = (rig: Rig): Controls => ({
  ...rig.keys,
  fire: rig.keys.fire || rig.finger !== null || rig.fireQueued,
  aim: rig.finger?.x ?? null,
});

function tick(rig: Rig): void {
  const { state } = rig;
  if (state.mode !== "game") {
    stepScene(state.scene, STEP_MS, Math.random);
    return;
  }
  const game = state.game;
  game.block = rig.o.nextBlock();
  stepGame(game, STEP_MS, controls(rig), Math.random);
  for (const event of game.events) {
    if (event.kind === "fire") rig.fireQueued = false;
    rig.o.sound.play(event);
  }
  game.events = [];
  if (game.phase.kind === "over" && !state.saved) {
    writeHiScore(rig.o.store, game.score);
    rig.hi = Math.max(rig.hi, game.score);
    state.saved = true;
  }
}

const moving = (rig: Rig) => (rig.state.mode === "game" ? rig.state.game.phase.kind !== "paused" : !rig.reduced);

function frame(rig: Rig, now: number): void {
  rig.pending += rig.last ? Math.min(250, now - rig.last) : STEP_MS;
  rig.last = now;
  let steps = 0;
  while (rig.pending >= STEP_MS && steps < MAX_STEPS) {
    tick(rig);
    rig.pending -= STEP_MS;
    steps++;
  }
  if (steps === MAX_STEPS) rig.pending = 0;
  draw(rig);
  report(rig);
  rig.raf = moving(rig) ? requestAnimationFrame((t) => frame(rig, t)) : 0;
}

function start(rig: Rig): void {
  if (rig.raf || !moving(rig) || !rig.onScreen || document.hidden) return;
  rig.last = 0;
  rig.pending = 0;
  rig.raf = requestAnimationFrame((t) => frame(rig, t));
}

export function stop(rig: Rig): void {
  cancelAnimationFrame(rig.raf);
  rig.raf = 0;
}

/** Run if anything moves and someone can see it; otherwise hold still, a game paused. */
export function sync(rig: Rig): void {
  const seen = rig.onScreen && !document.hidden;
  if (!seen && rig.state.mode === "game") pause(rig.state.game);
  if (seen && moving(rig)) start(rig);
  else {
    stop(rig);
    draw(rig);
    report(rig);
  }
}

export function toAttract(rig: Rig, mode: "attract" | "ready" = "attract"): void {
  rig.state = { mode, ...attractScene(rig) };
  rig.hovered = -1;
  sync(rig);
}

export function startGame(rig: Rig): void {
  const { specs, palette } = rig.o.roster();
  if (specs.length === 0) return;
  // The stage opens to the whole hero for a game (`arcade.css`); the class
  // goes on before measuring, so the grid is cut for the open stage and not
  // for the box the attract mode had.
  rig.host.classList.add("in-game");
  const { height } = size(rig);
  const cellCss = Math.min(5, Math.max(2, Math.floor((height - BAR_CSS) / GAME_ROWS)));
  rig.s = Math.max(1, Math.round(cellCss * dpr()));
  rig.ox = 0;
  const cols = Math.floor(rig.canvas.width / rig.s);
  const rows = Math.floor((rig.canvas.height - BAR_CSS * dpr()) / rig.s);
  const game = createGame(specs, gameBounds(cols, rows), Math.random, { hi: rig.hi, block: rig.o.nextBlock() });
  rig.state = { mode: "game", game, palette, saved: false };
  fitGame(rig, game);
  releaseAll(rig);
  rig.o.sound.unlock();
  sync(rig);
}

export function releaseAll(rig: Rig): void {
  rig.keys.left = rig.keys.right = rig.keys.fire = false;
  rig.finger = null;
  rig.fireQueued = false;
}

export function resume(rig: Rig): void {
  if (rig.state.mode === "game" && rig.state.game.phase.kind === "paused") {
    togglePause(rig.state.game);
    sync(rig);
  }
}

/** Back to the start: the score so far still counts for the hi-score, and the controls are put down. */
export function exit(rig: Rig): void {
  releaseAll(rig);
  if (rig.state.mode === "game" && !rig.state.saved) {
    writeHiScore(rig.o.store, rig.state.game.score);
    rig.hi = Math.max(rig.hi, rig.state.game.score);
  }
  toAttract(rig, "attract");
  // Blurring an attract-mode canvas changes nothing more: the scene is already the one a visitor first sees.
  rig.canvas.blur();
  rig.o.exited();
}

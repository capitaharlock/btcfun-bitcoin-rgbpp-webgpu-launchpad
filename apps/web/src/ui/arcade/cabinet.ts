/* The cabinet: what joins the rules to a canvas, a clock and a player.
 *
 * Three modes. Attract plays itself (`scene.ts`) and points at launches.
 * Ready is the same scene holding for a player who has picked up the controls
 * — the canvas has focus — until Space, Enter or a tap. Game is `game.ts`.
 *
 * The clock is a fixed step: however the frames arrive, the rules advance in
 * equal slices, so a game plays the same at 60 Hz and 144 Hz. It stops when
 * nothing moves — the scene scrolled away, the tab hidden, a paused game, the
 * attract mode under reduced motion — and a game in progress pauses rather
 * than carrying on unseen. Keys are only heard while the canvas has focus, so
 * the rest of the page scrolls and types as usual.
 */

import { drawGame, drawReady, drawScene, type Pointer, type ScenePalette } from "./draw";
import {
  canRestart,
  createGame,
  gameBounds,
  pause,
  stepGame,
  togglePause,
  type Controls,
  type Game,
} from "./game";
import { readHiScore, writeHiScore } from "./prefs";
import { createScene, invaderAt, seeded, stepScene, type InvaderSpec, type Scene } from "./scene";
import type { Sound } from "./sound";

/** CSS pixels per scene cell in the attract mode: chunkier on a large screen, finer on a phone. */
const CELL_CSS = { huge: 5, wide: 4, narrow: 3 } as const;
/** Width from which the scene uses its largest cells. */
const HUGE = 1200;
/** Width from which the headline sits over the left of the scene. */
const WIDE = 900;
/** How far the headline reaches into the scene when it overlaps it, in CSS px. */
const COPY_CSS = 640;
/** The strip along the bottom kept clear for the controls bar, in CSS px. */
export const BAR_CSS = 30;
/** Rows a game wants: the cell is as large as still fits about this many. */
const GAME_ROWS = 140;
/** How much time the still frame shows having passed. */
const STILL_MS = 2_600;
/** The rules' time step, and the most steps one frame may catch up. */
const STEP_MS = 1000 / 60;
const MAX_STEPS = 8;

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
  sound: Sound;
}

export interface Cabinet {
  /** The launches changed: rebuild the attract scene; a game in progress keeps its own. */
  recast(): void;
  setReduced(reduced: boolean): void;
  dispose(): void;
}

type State =
  | { mode: "attract" | "ready"; scene: Scene; palette: ScenePalette }
  | { mode: "game"; game: Game; palette: ScenePalette; saved: boolean };

export function mountCabinet(o: CabinetOptions): Cabinet {
  const { host, canvas } = o;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { recast() {}, setReduced() {}, dispose() {} };

  let reduced = o.reduced;
  let state: State;
  /** Device pixels per cell, and where the scene's origin sits on the canvas. */
  let s = 1;
  let ox = 0;
  let raf = 0;
  let last = 0;
  let pending = 0;
  let onScreen = true;
  let hovered = -1;
  let pointer: Pointer = window.matchMedia("(pointer: coarse)").matches ? "touch" : "keys";
  const keys = { left: false, right: false, fire: false };
  /** A finger (or a held mouse button) steering the cannon during a game. */
  let finger: { id: number; x: number } | null = null;
  /** A press of fire shorter than a frame still fires once: it waits here until a hash leaves. */
  let fireQueued = false;
  /** The mode a press began in: a click that focused the canvas does not also start the game. */
  let pressedIn: State["mode"] | null = null;
  let reported: Hud = ATTRACT_HUD;
  let hi = readHiScore();

  const dpr = () => window.devicePixelRatio || 1;

  const size = () => {
    const { width, height } = host.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(width * dpr()));
    canvas.height = Math.max(1, Math.floor(height * dpr()));
    return { width, height };
  };

  const attractScene = (): { scene: Scene; palette: ScenePalette } => {
    const { width } = size();
    const wide = width >= WIDE;
    const cell = width >= HUGE ? CELL_CSS.huge : wide ? CELL_CSS.wide : CELL_CSS.narrow;
    s = Math.max(1, Math.round(cell * dpr()));
    ox = 0;
    const cols = Math.floor(canvas.width / s);
    const rows = Math.floor((canvas.height - BAR_CSS * dpr()) / s);
    const left = wide ? Math.ceil((Math.min(COPY_CSS, width * 0.5) * dpr()) / s) : 4;
    const { specs, palette } = o.roster();
    const scene = createScene(specs, { width: cols, height: rows, left, right: cols - 4 }, seeded(7));
    if (reduced) {
      const still = seeded(11);
      for (let t = 0; t < STILL_MS; t += 16) stepScene(scene, 16, still);
    }
    return { scene, palette };
  };

  /** A game keeps its grid on resize: the cell is refitted and the field centred. */
  const fitGame = (game: Game) => {
    size();
    const room = canvas.height - BAR_CSS * dpr();
    s = Math.max(1, Math.floor(Math.min(canvas.width / game.scene.width, room / game.scene.height)));
    ox = Math.floor((canvas.width - game.scene.width * s) / 2);
  };

  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = state.palette.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, ox, 0);
    if (state.mode === "game") drawGame(ctx, state.game, state.palette, s, pointer);
    else {
      drawScene(ctx, state.scene, state.palette, s, { hovered, cannon: "show", ceiling: 14 });
      if (state.mode === "ready") drawReady(ctx, state.scene, state.palette, s, reduced);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const report = () => {
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
        : { ...ATTRACT_HUD, mode: state.mode, hi };
    const same = (Object.keys(hud) as Array<keyof Hud>).every((k) => hud[k] === reported[k]);
    if (!same) o.report((reported = hud));
  };

  const controls = (): Controls => ({ ...keys, fire: keys.fire || finger !== null || fireQueued, aim: finger?.x ?? null });

  const tick = () => {
    if (state.mode !== "game") {
      stepScene(state.scene, STEP_MS, Math.random);
      return;
    }
    const game = state.game;
    game.block = o.nextBlock();
    stepGame(game, STEP_MS, controls(), Math.random);
    for (const event of game.events) {
      if (event.kind === "fire") fireQueued = false;
      o.sound.play(event);
    }
    game.events = [];
    if (game.phase.kind === "over" && !state.saved) {
      writeHiScore(game.score);
      hi = Math.max(hi, game.score);
      state.saved = true;
    }
  };

  const moving = () =>
    state.mode === "game" ? state.game.phase.kind !== "paused" : !reduced;

  const frame = (now: number) => {
    pending += last ? Math.min(250, now - last) : STEP_MS;
    last = now;
    let steps = 0;
    while (pending >= STEP_MS && steps < MAX_STEPS) {
      tick();
      pending -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS) pending = 0;
    draw();
    report();
    raf = moving() ? requestAnimationFrame(frame) : 0;
  };

  const start = () => {
    if (raf || !moving() || !onScreen || document.hidden) return;
    last = 0;
    pending = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  /** Run if anything moves and someone can see it; otherwise hold still, a game paused. */
  const sync = () => {
    const seen = onScreen && !document.hidden;
    if (!seen && state.mode === "game") pause(state.game);
    if (seen && moving()) start();
    else {
      stop();
      draw();
      report();
    }
  };

  const toAttract = (mode: "attract" | "ready" = "attract") => {
    state = { mode, ...attractScene() };
    hovered = -1;
    sync();
  };

  const startGame = () => {
    const { specs, palette } = o.roster();
    if (specs.length === 0) return;
    const { height } = size();
    const cellCss = Math.min(4, Math.max(2, Math.floor((height - BAR_CSS) / GAME_ROWS)));
    s = Math.max(1, Math.round(cellCss * dpr()));
    ox = 0;
    const cols = Math.floor(canvas.width / s);
    const rows = Math.floor((canvas.height - BAR_CSS * dpr()) / s);
    const game = createGame(specs, gameBounds(cols, rows), Math.random, { hi, block: o.nextBlock() });
    state = { mode: "game", game, palette, saved: false };
    fitGame(game);
    releaseAll();
    o.sound.unlock();
    sync();
  };

  const releaseAll = () => {
    keys.left = keys.right = keys.fire = false;
    finger = null;
    fireQueued = false;
  };

  // ---- keyboard: only while the canvas has focus ----

  const MOVE_LEFT = new Set(["ArrowLeft", "a", "A"]);
  const MOVE_RIGHT = new Set(["ArrowRight", "d", "D"]);

  const keydown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    pointer = "keys";
    o.sound.unlock();
    const key = e.key;
    const fire = key === " " || key === "Spacebar";
    if (state.mode !== "game") {
      if (fire || key === "Enter") {
        e.preventDefault();
        startGame();
      }
      return;
    }
    const game = state.game;
    const phase = game.phase.kind;
    if (MOVE_LEFT.has(key) || MOVE_RIGHT.has(key) || key === "ArrowUp" || key === "ArrowDown") {
      e.preventDefault();
      if (MOVE_LEFT.has(key)) keys.left = true;
      if (MOVE_RIGHT.has(key)) keys.right = true;
      return;
    }
    if (fire || key === "Enter") {
      e.preventDefault();
      if (phase === "over") {
        if (canRestart(game) && !e.repeat) startGame();
      } else if (phase === "paused") {
        if (!e.repeat) resume();
      } else if (fire) {
        keys.fire = true;
        if (!e.repeat) fireQueued = true;
      }
      return;
    }
    if (key === "p" || key === "P" || key === "Escape") {
      e.preventDefault();
      if (phase === "over") {
        if (key === "Escape") toAttract("ready");
        return;
      }
      if (phase === "paused") resume();
      else {
        togglePause(game);
        releaseAll();
        sync();
      }
    }
  };

  const keyup = (e: KeyboardEvent) => {
    if (MOVE_LEFT.has(e.key)) keys.left = false;
    if (MOVE_RIGHT.has(e.key)) keys.right = false;
    if (e.key === " " || e.key === "Spacebar") keys.fire = false;
  };

  const resume = () => {
    if (state.mode === "game" && state.game.phase.kind === "paused") {
      togglePause(state.game);
      sync();
    }
  };

  const focus = () => {
    // With no launch there is no formation, so nothing to play yet.
    if (state.mode === "attract" && state.scene.invaders.length > 0) {
      state = { ...state, mode: "ready" };
      sync();
    }
  };

  const blur = () => {
    releaseAll();
    if (state.mode === "ready") {
      state = { ...state, mode: "attract" };
      sync();
    } else if (state.mode === "game") {
      if (state.game.phase.kind === "over") toAttract();
      else {
        pause(state.game);
        sync();
      }
    }
  };

  // ---- pointer: name and open launches in the attract mode; steer and fire in a game ----

  const cellAt = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) * dpr() - ox) / s, ((e.clientY - rect.top) * dpr()) / s] as const;
  };

  const invaderUnder = (e: PointerEvent) => {
    if (state.mode === "game") return -1;
    const [x, y] = cellAt(e);
    return invaderAt(state.scene, x, y);
  };

  const pointerdown = (e: PointerEvent) => {
    pointer = e.pointerType === "touch" ? "touch" : pointer;
    pressedIn = state.mode;
    o.sound.unlock();
    if (state.mode !== "game") return;
    const game = state.game;
    if (game.phase.kind === "paused") {
      resume();
      return;
    }
    if (game.phase.kind === "over") {
      if (canRestart(game)) startGame();
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    finger = { id: e.pointerId, x: cellAt(e)[0] };
    fireQueued = true;
  };

  const pointermove = (e: PointerEvent) => {
    if (state.mode === "game") {
      if (finger?.id === e.pointerId) finger.x = cellAt(e)[0];
      return;
    }
    if (e.pointerType === "touch") return;
    hovered = invaderUnder(e);
    canvas.classList.toggle("pointing", hovered >= 0);
    if (!raf) draw();
  };

  const pointerup = (e: PointerEvent) => {
    if (finger?.id === e.pointerId) finger = null;
    const began = pressedIn;
    pressedIn = null;
    if (state.mode === "game") return;
    if (began === "ready") {
      startGame();
      return;
    }
    const hit = invaderUnder(e);
    if (hit >= 0 && (e.pointerType !== "touch" || hovered === hit)) {
      o.pick(state.scene.specs[state.scene.invaders[hit].spec]);
      return;
    }
    hovered = hit;
    if (!raf) draw();
  };

  const pointerleave = () => {
    hovered = -1;
    canvas.classList.remove("pointing");
    if (!raf) draw();
  };

  const pointercancel = (e: PointerEvent) => {
    if (finger?.id === e.pointerId) finger = null;
  };

  // ---- wiring ----

  const resize = new ResizeObserver(() => {
    if (state.mode === "game") {
      fitGame(state.game);
      draw();
    } else {
      const mode = state.mode;
      state = { mode, ...attractScene() };
      sync();
    }
  });
  const seen = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });

  state = { mode: "attract", ...attractScene() };
  resize.observe(host);
  seen.observe(host);
  document.addEventListener("visibilitychange", sync);
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("keyup", keyup);
  canvas.addEventListener("focus", focus);
  canvas.addEventListener("blur", blur);
  canvas.addEventListener("pointerdown", pointerdown);
  canvas.addEventListener("pointermove", pointermove);
  canvas.addEventListener("pointerup", pointerup);
  canvas.addEventListener("pointerleave", pointerleave);
  canvas.addEventListener("pointercancel", pointercancel);
  sync();

  return {
    recast() {
      if (state.mode !== "game") toAttract(state.mode);
    },
    setReduced(next) {
      if (next === reduced) return;
      reduced = next;
      if (state.mode !== "game") toAttract(state.mode);
    },
    dispose() {
      stop();
      resize.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("keyup", keyup);
      canvas.removeEventListener("focus", focus);
      canvas.removeEventListener("blur", blur);
      canvas.removeEventListener("pointerdown", pointerdown);
      canvas.removeEventListener("pointermove", pointermove);
      canvas.removeEventListener("pointerup", pointerup);
      canvas.removeEventListener("pointerleave", pointerleave);
      canvas.removeEventListener("pointercancel", pointercancel);
    },
  };
}

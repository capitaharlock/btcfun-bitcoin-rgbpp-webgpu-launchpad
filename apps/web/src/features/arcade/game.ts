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
 * `stepGame` advances by a time step with the player's controls and a random
 * source passed in; what a frame should sound like comes back as `events`.
 */

import { group } from "@/ui/format";
import { alive, CANNON, cannonY, clamp, formationHeight, groundY, invaderAt, invaderRect, SPRITE_H, SPRITE_W, STEP_Y } from "./scene/geometry";
import { burst, createScene, explode, stepEffects, stepFormation, stepStars } from "./scene/step";
import { CANNON_SIZE, type Formation, type Invader, type InvaderSpec, type Rand, type Rect, type Scene, type SceneBounds } from "./scene";
import { drawClz, flyShot, shotHash, sweep } from "./scene/shots";
import { freshBunker, bunkerY, scour, erode } from "./scene/bunker";

/** One and a half of the original cabinet's playfield, in cells: an open stage fills a wide screen, and wider still would only make the cannon slower to cross. */
export const FIELD_MAX = 336;
/** Rows above the formation: the score line, the mystery ship's lane and its label. */
export const HUD_Y = 2;
export const UFO_Y = 11;
export const GAME_TOP = 26;

const PITCH_X = SPRITE_W + 5;
const PITCH_Y = SPRITE_H + 5;
const COLS_MAX = 11;
const ROWS_MAX = 5;
/** Room left beside the formation to march in. */
const MARCH_ROOM = 32;

const LIVES = 3;
const MAX_LIVES = 5;
/** A life is added each time the score passes a multiple of this. */
export const EXTRA_LIFE_EVERY = 20_000;

const PLAYER_SPEED = 0.075; // cells per ms
const SHOT_SPEED = 0.3;
const BOMB_W = 3;
const BOMB_H = 6;
const BOMB_SPEED = 0.042;
const UFO_W = 16;
const UFO_H = 7;
const UFO_SPEED = 0.04;
/** The mystery ship only flies while this many invaders remain, as in the original. */
const UFO_MIN_INVADERS = 8;
const UFO_BONUSES = [1_000, 2_000, 3_000, 5_000] as const;

/** The march's pace: `BASE_STEP_MS` for a full first wave, down to `MIN_STEP_MS` for the last invader. */
const BASE_STEP_MS = 480;
const MIN_STEP_MS = 30;
const INTRO_MS = 1_800;
const DYING_MS = 1_500;
const SAFE_MS = 2_000;
/** Game over holds this long before a key can start another, so a held Space does not skip it. */
export const OVER_HOLD_MS = 900;

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

export function createGame(
  specs: readonly InvaderSpec[],
  bounds: SceneBounds,
  rand: Rand,
  { hi, block }: { hi: number; block: number },
): Game {
  if (specs.length === 0) throw new Error("a game needs at least one launch");
  const scene = createScene(specs, bounds, rand);
  arrangeWave(scene, 1);
  scene.cannon.x = scene.cannon.target = Math.round((scene.left + scene.right) / 2);
  return {
    scene,
    phase: { kind: "intro", until: INTRO_MS },
    score: 0,
    hi,
    best: hi,
    lives: LIVES,
    wave: 1,
    total: scene.invaders.length,
    bombs: [],
    ufo: null,
    nextBomb: INTRO_MS + bombGap(1),
    nextUfo: INTRO_MS + 18_000 + rand() * 8_000,
    safeUntil: 0,
    nextLife: EXTRA_LIFE_EVERY,
    beat: 0,
    block,
    events: [{ kind: "wave" }],
  };
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

function bombGap(wave: number): number {
  return Math.max(320, 1_100 * 0.88 ** (wave - 1));
}

function maxBombs(wave: number): number {
  return Math.min(4, 2 + Math.floor((wave - 1) / 2));
}

function bombSpeed(wave: number): number {
  return BOMB_SPEED * Math.min(1.6, 1 + 0.08 * (wave - 1));
}

export function ufoRect(ufo: Pick<Ufo, "x">): Rect {
  return { x: Math.round(ufo.x), y: UFO_Y, w: UFO_W, h: UFO_H };
}

export function bombRect(bomb: Pick<Bomb, "x" | "y">): Rect {
  return { x: Math.round(bomb.x), y: Math.round(bomb.y), w: BOMB_W, h: BOMB_H };
}

/** Whether a point is on a lit cell of the cannon: a bomb past the barrel's side misses. */
export function hitsCannon(scene: Scene, x: number, y: number): boolean {
  const gx = Math.floor(x - Math.round(scene.cannon.x - CANNON_SIZE.w / 2));
  const gy = Math.floor(y - cannonY(scene));
  return gy >= 0 && gy < CANNON_SIZE.h && gx >= 0 && gx < CANNON_SIZE.w && CANNON[gy][gx] === 1;
}

/** Pause a running game, or resume a paused one. A finished game is left as it is. */
export function togglePause(game: Game): void {
  const p = game.phase;
  if (p.kind === "paused") game.phase = p.resume;
  else if (p.kind !== "over") game.phase = { kind: "paused", resume: p };
}

export function pause(game: Game): void {
  if (game.phase.kind !== "paused") togglePause(game);
}

/** A finished game that has been on screen long enough to start another from. */
export function canRestart(game: Game): boolean {
  return game.phase.kind === "over" && game.scene.time - game.phase.at >= OVER_HOLD_MS;
}

/** Advance the game by `dt` milliseconds. Mutates and returns it. */
export function stepGame(game: Game, dt: number, controls: Controls, rand: Rand): Game {
  const phase = game.phase;
  if (phase.kind === "paused") return game;
  const scene = game.scene;
  const t = (scene.time += dt);
  stepStars(scene, dt, rand);

  switch (phase.kind) {
    case "intro":
      steer(game, dt, controls);
      if (t >= phase.until) game.phase = { kind: "playing" };
      break;
    case "playing":
      play(game, dt, controls, rand);
      break;
    case "dying":
      if (t >= phase.until) {
        if (game.lives > 0) respawn(game);
        else {
          game.phase = { kind: "over", at: t, cause: phase.cause, record: game.score > game.best };
          game.events.push({ kind: "over" });
        }
      }
      break;
    case "over":
      break;
  }

  stepEffects(scene, dt);
  return game;
}

function steer(game: Game, dt: number, controls: Controls): void {
  const c = game.scene.cannon;
  const reach = PLAYER_SPEED * dt;
  let move = ((controls.right ? 1 : 0) - (controls.left ? 1 : 0)) * reach;
  if (move === 0 && controls.aim !== null) move = clamp(controls.aim - c.x, -reach, reach);
  const half = CANNON_SIZE.w / 2;
  c.x = clamp(c.x + move, game.scene.left + half, game.scene.right - half);
  c.target = c.x;
}

function play(game: Game, dt: number, controls: Controls, rand: Rand): void {
  const scene = game.scene;
  const t = scene.time;
  steer(game, dt, controls);

  // One hash in flight at a time, as the original allowed one shot.
  if (controls.fire && scene.shots.length === 0) {
    const clz = drawClz(rand);
    const { text, zeros } = shotHash(clz, rand, 1);
    scene.shots.push({ x: Math.round(scene.cannon.x) - 1, y: cannonY(scene) - 1, text, zeros, clz });
    scene.cannon.lastShot = t;
    game.events.push({ kind: "fire" });
  }

  march(game, rand);
  if (game.phase.kind !== "playing") return;
  dropBombs(game, rand);
  moveBombs(game, dt, rand);
  if (game.phase.kind !== "playing") return;
  moveShots(game, dt, rand);
  flyUfo(game, dt, rand);

  if (living(scene).length === 0) nextWave(game);
}

function march(game: Game, rand: Rand): void {
  const scene = game.scene;
  let live = living(scene);
  while (scene.formation.next <= scene.time) {
    const cols = live.map((inv) => inv.col);
    const bottom = Math.max(...live.map((inv) => inv.row));
    scene.formation = stepFormation(scene.formation, scene, {
      interval: marchInterval(game, live.length),
      cols: [Math.min(...cols), Math.max(...cols)],
      bottom,
      wrap: false,
    });
    game.events.push({ kind: "march", beat: game.beat });
    game.beat = (game.beat + 1) % 4;
    live = living(scene);
  }
  for (const inv of live) {
    const rect = invaderRect(scene, inv);
    for (const bunker of scene.bunkers) scour(bunker, rect);
    if (rect.y + rect.h >= cannonY(scene)) {
      game.lives = 0;
      killPlayer(game, "invaded", rand);
      return;
    }
  }
}

function dropBombs(game: Game, rand: Rand): void {
  const scene = game.scene;
  if (scene.time < game.nextBomb) return;
  game.nextBomb = scene.time + bombGap(game.wave) * (0.5 + rand());
  if (game.bombs.length >= maxBombs(game.wave)) return;
  const live = living(scene);
  if (live.length === 0) return;
  // Half the bombs come from the column over the cannon: the formation aims.
  const cols = [...new Set(live.map((inv) => inv.col))];
  const f = scene.formation;
  const over = (col: number) => Math.abs(f.x + col * f.pitchX + SPRITE_W / 2 - scene.cannon.x);
  const col =
    rand() < 0.5 ? cols.reduce((a, b) => (over(b) < over(a) ? b : a)) : cols[Math.floor(rand() * cols.length)];
  const lowest = live.filter((inv) => inv.col === col).reduce((a, b) => (b.row > a.row ? b : a));
  const rect = invaderRect(scene, lowest);
  game.bombs.push({ x: rect.x + Math.floor((SPRITE_W - BOMB_W) / 2), y: rect.y + SPRITE_H, spec: lowest.spec });
}

function moveBombs(game: Game, dt: number, rand: Rand): void {
  const scene = game.scene;
  const floor = groundY(scene);
  game.bombs = game.bombs.filter((bomb) => {
    const from = bomb.y + BOMB_H;
    bomb.y += bombSpeed(game.wave) * dt;
    const x = Math.round(bomb.x) + 1;
    let struck: "cover" | "cannon" | null = null;
    sweep(from, bomb.y + BOMB_H, (y) => {
      if (scene.bunkers.some((b) => erode(b, x, y, rand, 1))) struck = "cover";
      else if (scene.time >= game.safeUntil && [x - 1, x, x + 1].some((bx) => hitsCannon(scene, bx, y))) struck = "cannon";
      return struck !== null;
    });
    if (struck === "cannon") {
      killPlayer(game, "shot", rand);
      return false;
    }
    if (struck === "cover") return false;
    if (bomb.y + BOMB_H >= floor) {
      burst(scene, { x: bomb.x - 1, y: floor - 2, w: BOMB_W + 2, h: 2 }, bomb.spec, rand, 5);
      return false;
    }
    return true;
  });
  if (game.phase.kind !== "playing") game.bombs = [];
}

function moveShots(game: Game, dt: number, rand: Rand): void {
  const scene = game.scene;
  scene.shots = scene.shots.filter((shot) =>
    flyShot(scene, shot, SHOT_SPEED * dt, rand, (x, y) => {
      const hit = invaderAt(scene, x, y);
      if (hit >= 0) {
        score(game, explode(scene, hit, shot.clz, rand, Infinity));
        game.events.push({ kind: "hit" });
        return true;
      }
      const ufo = game.ufo;
      if (ufo && inside(ufoRect(ufo), x, y)) {
        const rect = ufoRect(ufo);
        burst(scene, rect, "bitcoin", rand, 24);
        scene.popups.push({ x: rect.x + UFO_W / 2, y: UFO_Y + UFO_H + 8, text: `+${group(ufo.bonus)} BLOCK`, tint: "bitcoin", born: scene.time });
        score(game, ufo.bonus);
        game.ufo = null;
        game.nextUfo = scene.time + ufoGap(rand);
        game.events.push({ kind: "ufoHit" });
        return true;
      }
      const bomb = game.bombs.findIndex((b) => inside({ ...bombRect(b), x: bombRect(b).x - 1, w: BOMB_W + 2 }, x, y));
      if (bomb >= 0) {
        burst(scene, bombRect(game.bombs[bomb]), "ink", rand, 6);
        game.bombs.splice(bomb, 1);
        return true;
      }
      return false;
    }),
  );
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function ufoGap(rand: Rand): number {
  return 20_000 + rand() * 10_000;
}

function flyUfo(game: Game, dt: number, rand: Rand): void {
  const scene = game.scene;
  if (!game.ufo) {
    if (scene.time < game.nextUfo || living(scene).length < UFO_MIN_INVADERS) return;
    const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
    const bonus = UFO_BONUSES[Math.floor(rand() * UFO_BONUSES.length)];
    game.ufo = { x: dir === 1 ? scene.left - UFO_W : scene.right, dir, block: game.block, bonus };
    game.events.push({ kind: "ufo" });
    return;
  }
  const ufo = game.ufo;
  ufo.x += ufo.dir * UFO_SPEED * dt;
  if (ufo.x > scene.right || ufo.x < scene.left - UFO_W) {
    game.ufo = null;
    game.nextUfo = scene.time + ufoGap(rand);
  }
}

function score(game: Game, points: number): void {
  game.score += points;
  game.hi = Math.max(game.hi, game.score);
  while (game.score >= game.nextLife) {
    game.nextLife += EXTRA_LIFE_EVERY;
    if (game.lives < MAX_LIVES) {
      game.lives++;
      game.events.push({ kind: "extraLife" });
    }
  }
}

function killPlayer(game: Game, cause: Cause, rand: Rand): void {
  const scene = game.scene;
  const c = scene.cannon;
  burst(scene, { x: c.x - CANNON_SIZE.w / 2, y: cannonY(scene), w: CANNON_SIZE.w, h: CANNON_SIZE.h }, "bitcoin", rand, 40);
  game.lives = Math.max(0, game.lives - 1);
  scene.shots = [];
  game.phase = { kind: "dying", until: scene.time + DYING_MS, cause };
  game.events.push({ kind: "playerHit" });
}

function respawn(game: Game): void {
  const scene = game.scene;
  scene.cannon.x = scene.cannon.target = Math.round((scene.left + scene.right) / 2);
  game.bombs = [];
  game.safeUntil = scene.time + SAFE_MS;
  // The formation stood still while the cannon was down; it resumes from now, not from then.
  scene.formation = { ...scene.formation, next: scene.time + marchInterval(game, living(scene).length) };
  game.nextBomb = scene.time + bombGap(game.wave) * 1.5;
  game.phase = { kind: "playing" };
}

function nextWave(game: Game): void {
  const scene = game.scene;
  game.wave++;
  arrangeWave(scene, game.wave);
  game.total = scene.invaders.length;
  game.bombs = [];
  game.ufo = null;
  game.nextBomb = scene.time + INTRO_MS + bombGap(game.wave);
  game.phase = { kind: "intro", until: scene.time + INTRO_MS };
  game.events.push({ kind: "wave" });
}

export const GAME_TIMING = { INTRO_MS, DYING_MS, SAFE_MS, OVER_HOLD_MS } as const;
export const BOMB_SIZE = { w: BOMB_W, h: BOMB_H } as const;
export const UFO_SIZE = { w: UFO_W, h: UFO_H } as const;
export { LIVES };

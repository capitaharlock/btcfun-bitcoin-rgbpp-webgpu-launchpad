/* The front page's arcade scene, as data and rules — no canvas, no clock.
 *
 * The metaphor is the product: every invader is a real launch, drawn as its
 * own sprite; the cannon is Bitcoin, and what it fires are hashes; a hit
 * scores what a hash of that strength would mint on that launch today. The
 * rules here are the whole game: `stepScene` advances it by a time step with
 * an injected random source, so it is deterministic under test and the
 * reduced-motion still frame is the same picture on every load.
 *
 * Units are virtual pixels — one cell of a sprite — and milliseconds.
 */

import type { PixelGrid } from "../pixels";
import { GLYPH_H } from "./font";

export { seeded } from "../random";

export const SPRITE_W = 11;
export const SPRITE_H = 8;
/** Formation pitch: a sprite plus the gutter around it. */
export const CELL_W = SPRITE_W + 9;
export const CELL_H = SPRITE_H + 8;
/** Where the formation starts: a fifth of the way down, clear of the HUD. */
export function formationTop(height: number): number {
  return Math.max(14, Math.round(height * 0.22));
}
/** Cells the formation moves per step, and drops at an edge. */
export const STEP_X = 2;
export const STEP_Y = 5;
export const STEP_MS = 420;

const CANNON_W = 13;
const CANNON_H = 10;
const CANNON_SPEED = 0.07; // cells per ms
const SHOT_SPEED = 0.16;
const FIRE_COOLDOWN_MS = 1150;
const RESPAWN_MS = 1700;
const FLASH_MS = 420;
const POPUP_MS = 1100;
const PARTICLE_MS = 700;
const GRAVITY = 0.00018; // cells per ms²
/** Hash characters in a shot: the leading zeros, then two more. */
const SHOT_TAIL = 2;

const BUNKER = [
  "..########..",
  ".##########.",
  "############",
  "############",
  "####....####",
  "###......###",
];
const BUNKER_W = BUNKER[0].length;
const BUNKER_H = BUNKER.length;

export type Rand = () => number;

/** One launch as the scene needs it. */
export interface InvaderSpec {
  id: string;
  symbol: string;
  /** The two frames of its sprite (`pixelSigil`). */
  frames: readonly [PixelGrid, PixelGrid];
  /** What a hash of `clz` leading zero bits mints on it now, as display text. */
  reward: (clz: number) => string;
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
}

export interface Invader {
  spec: number;
  col: number;
  row: number;
  /** Dead until this time; alive when in the past. */
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

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  /** Index of the launch whose colour it carries, or -1 for white. */
  spec: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  spec: number;
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

export function groundY(scene: Pick<Scene, "height">): number {
  return scene.height - 3;
}

export function cannonY(scene: Pick<Scene, "height">): number {
  return groundY(scene) - CANNON_H - 1;
}

export function bunkerY(scene: Pick<Scene, "height">): number {
  return cannonY(scene) - BUNKER_H - 8;
}

/** Most invaders in a row: past this a formation reads better as more rows. */
const ROW_MAX = 6;

/** Columns that fit the playfield, leaving room to march, in balanced rows. */
export function columnsFor(count: number, span: number): number {
  const fit = Math.max(1, Math.floor((span - 4 * STEP_X * 4) / CELL_W));
  const cap = Math.min(fit, ROW_MAX);
  const rows = Math.max(1, Math.ceil(count / cap));
  return Math.max(1, Math.min(cap, Math.ceil(count / rows)));
}

export function formationWidth(f: Pick<Formation, "cols">): number {
  return f.cols * CELL_W - (CELL_W - SPRITE_W);
}

export function formationHeight(f: Pick<Formation, "rows">): number {
  return f.rows * CELL_H - (CELL_H - SPRITE_H);
}

export function createScene(specs: readonly InvaderSpec[], bounds: SceneBounds, rand: Rand): Scene {
  const span = bounds.right - bounds.left;
  const cols = columnsFor(specs.length, span);
  const rows = Math.max(1, Math.ceil(specs.length / cols));
  const formation: Formation = { x: 0, y: formationTop(bounds.height), dir: 1, frame: 0, next: STEP_MS, cols, rows };
  formation.x = Math.round(bounds.left + (span - formationWidth(formation)) / 2);

  const scene: Scene = {
    ...bounds,
    time: 0,
    specs,
    formation,
    invaders: specs.map((_, i) => ({ spec: i, col: i % cols, row: Math.floor(i / cols), deadUntil: 0, flashUntil: 0 })),
    shots: [],
    particles: [],
    popups: [],
    bunkers: [],
    stars: [],
    cannon: { x: Math.round((bounds.left + bounds.right) / 2), target: 0, lastShot: -FIRE_COOLDOWN_MS },
    hits: 0,
  };
  scene.cannon.target = scene.cannon.x;
  scene.bunkers = placeBunkers(scene);
  scene.stars = makeStars(bounds.width, bounds.height, rand);
  return scene;
}

function placeBunkers(scene: Scene): Bunker[] {
  const span = scene.right - scene.left;
  const count = Math.max(2, Math.min(4, Math.floor(span / 48)));
  const y = bunkerY(scene);
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(scene.left + ((i + 0.5) * span) / count - BUNKER_W / 2),
    y,
    cells: BUNKER.map((row) => [...row].map((c) => c === "#")),
  }));
}

function makeStars(width: number, height: number, rand: Rand): Star[] {
  const density = (width * height) / 900;
  const layers: Array<[0 | 1 | 2, number, number]> = [
    [0, 0.6, 0.0015],
    [1, 0.3, 0.004],
    [2, 0.12, 0.009],
  ];
  return layers.flatMap(([layer, share, speed]) =>
    Array.from({ length: Math.ceil(density * share) }, () => ({
      x: Math.floor(rand() * width),
      y: rand() * height,
      speed,
      layer,
    })),
  );
}

/** Where an invader is drawn, whether or not it is alive. */
export function invaderRect(scene: Pick<Scene, "formation">, invader: Pick<Invader, "col" | "row">): Rect {
  const f = scene.formation;
  return { x: f.x + invader.col * CELL_W, y: f.y + invader.row * CELL_H, w: SPRITE_W, h: SPRITE_H };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

export function alive(invader: Invader, time: number): boolean {
  return invader.deadUntil <= time;
}

/** The live invader at a point, or -1. */
export function invaderAt(scene: Scene, x: number, y: number): number {
  return scene.invaders.findIndex((inv) => alive(inv, scene.time) && contains(invaderRect(scene, inv), x, y));
}

/**
 * One march step: sideways, or down and about-face when the next step would
 * leave the playfield. A formation that has marched down to the bunkers starts
 * a new wave at the top rather than invading: nobody loses this game.
 */
export function stepFormation(f: Formation, scene: Pick<Scene, "left" | "right" | "height">): Formation {
  const width = formationWidth(f);
  const nextX = f.x + f.dir * STEP_X;
  const frame: 0 | 1 = f.frame === 0 ? 1 : 0;
  if (nextX < scene.left || nextX + width > scene.right) {
    const y = f.y + STEP_Y;
    const wave = y + formationHeight(f) > bunkerY(scene) - 6;
    return { ...f, y: wave ? formationTop(scene.height) : y, dir: f.dir === 1 ? -1 : 1, frame, next: f.next + STEP_MS };
  }
  return { ...f, x: nextX, frame, next: f.next + STEP_MS };
}

/** A hash with `clz` leading zero bits, as the shot's text: zeros, then a tail. */
export function shotHash(clz: number, rand: Rand): { text: string; zeros: number } {
  const zeros = Math.floor(clz / 4);
  let tail = "";
  // The first character after the zeros is bounded by the remaining zero bits.
  // Exactly `clz` zero bits: the next nibble has its first one bit where the
  // count stops, so it lies in [8 >> rest, 16 >> rest).
  const rest = clz % 4;
  const first = (8 >> rest) + Math.floor(rand() * (8 >> rest));
  tail += first.toString(16);
  for (let i = 1; i < SHOT_TAIL; i++) tail += Math.floor(rand() * 16).toString(16);
  return { text: "0".repeat(zeros) + tail, zeros };
}

/** Remove the bunker cell under a point, and a neighbour or two: returns true when one was hit. */
export function erode(bunker: Bunker, x: number, y: number, rand: Rand): boolean {
  const cx = Math.floor(x - bunker.x);
  const cy = Math.floor(y - bunker.y);
  if (cy < 0 || cy >= BUNKER_H || cx < 0 || cx >= BUNKER_W || !bunker.cells[cy][cx]) return false;
  bunker.cells[cy][cx] = false;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (ny >= 0 && ny < BUNKER_H && nx >= 0 && nx < BUNKER_W && rand() < 0.45) bunker.cells[ny][nx] = false;
  }
  return true;
}

function bunkerLeft(bunker: Bunker): number {
  return bunker.cells.flat().filter(Boolean).length;
}

/** Height of a shot in cells: one glyph per character, one cell between. */
export function shotLength(shot: Pick<Shot, "text">): number {
  return shot.text.length * (GLYPH_H + 1) - 1;
}

/** Advance the scene by `dt` milliseconds. Mutates and returns the scene. */
export function stepScene(scene: Scene, dt: number, rand: Rand): Scene {
  const t = (scene.time += dt);

  for (const star of scene.stars) {
    star.y += star.speed * dt;
    if (star.y >= scene.height) {
      star.y -= scene.height;
      star.x = Math.floor(rand() * scene.width);
    }
  }

  while (scene.formation.next <= t) scene.formation = stepFormation(scene.formation, scene);

  for (const inv of scene.invaders) {
    if (inv.deadUntil > 0 && inv.deadUntil <= t && inv.flashUntil < inv.deadUntil) inv.flashUntil = inv.deadUntil + FLASH_MS;
  }

  stepCannon(scene, dt, rand);

  // Shots: move, then test the tip against bunkers and invaders.
  const kept: Shot[] = [];
  for (const shot of scene.shots) {
    shot.y -= SHOT_SPEED * dt;
    const tipX = shot.x + 1;
    const tipY = shot.y;
    if (tipY + shotLength(shot) < 0) continue;
    const bunker = scene.bunkers.find((b) => erode(b, tipX, tipY, rand));
    if (bunker) continue;
    const hit = invaderAt(scene, tipX, tipY);
    if (hit >= 0) {
      explode(scene, hit, shot, rand);
      continue;
    }
    kept.push(shot);
  }
  scene.shots = kept;

  // A bunker shot to rubble is rebuilt, so the scene never runs out of cover.
  for (const bunker of scene.bunkers) {
    if (bunkerLeft(bunker) < 12) bunker.cells = BUNKER.map((row) => [...row].map((c) => c === "#"));
  }

  scene.particles = scene.particles.filter((p) => t - p.born < PARTICLE_MS);
  for (const p of scene.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += GRAVITY * dt;
  }
  scene.popups = scene.popups.filter((p) => t - p.born < POPUP_MS);
  return scene;
}

function stepCannon(scene: Scene, dt: number, rand: Rand): void {
  const c = scene.cannon;
  const living = scene.invaders.filter((inv) => alive(inv, scene.time));
  const reached = Math.abs(c.x - c.target) < 1;
  if (reached && living.length > 0 && scene.time - c.lastShot >= FIRE_COOLDOWN_MS) {
    const clz = 16 + Math.floor(rand() * 9);
    const { text, zeros } = shotHash(clz, rand);
    scene.shots.push({ x: Math.round(c.x) - 1, y: cannonY(scene) - shotLength({ text }) - 1, text, zeros, clz });
    c.lastShot = scene.time;
    // Aim ahead at a random survivor: where it will be, roughly, when the shot arrives.
    const next = living[Math.floor(rand() * living.length)];
    const rect = invaderRect(scene, next);
    const lead = scene.formation.dir * STEP_X * 2;
    c.target = clamp(rect.x + Math.floor(SPRITE_W / 2) + lead, scene.left + CANNON_W / 2, scene.right - CANNON_W / 2);
  }
  const step = CANNON_SPEED * dt;
  if (Math.abs(c.target - c.x) <= step) c.x = c.target;
  else c.x += Math.sign(c.target - c.x) * step;
}

function explode(scene: Scene, index: number, shot: Shot, rand: Rand): void {
  const inv = scene.invaders[index];
  const rect = invaderRect(scene, inv);
  const t = scene.time;
  inv.deadUntil = t + RESPAWN_MS;
  inv.flashUntil = 0;
  scene.hits++;
  for (let i = 0; i < 16; i++) {
    scene.particles.push({
      x: rect.x + rand() * rect.w,
      y: rect.y + rand() * rect.h,
      vx: (rand() - 0.5) * 0.09,
      vy: -rand() * 0.07,
      born: t,
      spec: rand() < 0.25 ? -1 : inv.spec,
    });
  }
  const spec = scene.specs[inv.spec];
  scene.popups.push({ x: rect.x + SPRITE_W / 2, y: rect.y, text: `+${spec.reward(shot.clz)} ${spec.symbol}`, spec: inv.spec, born: t });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export const TIMING = { POPUP_MS, PARTICLE_MS, FLASH_MS, RESPAWN_MS } as const;
export const CANNON_SIZE = { w: CANNON_W, h: CANNON_H } as const;

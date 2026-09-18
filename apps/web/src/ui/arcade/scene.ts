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
 */

import { group } from "../../lib/format";
import { MIN_CLZ } from "../../lib/standard";
import type { PixelGrid } from "../pixels";
import { glyph, GLYPH_H } from "./font";

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
/** Hashes in the scene: at least `MIN_CLZ` zero bits, and the odds halve per extra bit, as mining's do. */
const CLZ_MIN = MIN_CLZ;
const CLZ_MAX = MIN_CLZ + 8;
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

/** The ₿ cannon: a barrel on a body, with the coin's letter cut out of it. */
export const CANNON: PixelGrid = (() => {
  const w = CANNON_W;
  const h = CANNON_H;
  const mid = Math.floor(w / 2);
  const rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      if (y === 0) return x === mid ? 1 : 0;
      if (y < 3) return Math.abs(x - mid) <= 1 ? 1 : 0;
      if (y === 3) return x > 0 && x < w - 1 ? 1 : 0;
      return 1;
    }),
  );
  // The B, and the two strokes through it that make it ₿.
  const left = mid - 1;
  glyph("B").forEach((row, gy) =>
    row.forEach((on, gx) => {
      if (on) rows[4 + gy][left + gx] = 0;
    }),
  );
  rows[3][left] = 0;
  rows[3][left + 1] = 0;
  rows[h - 1][left] = 0;
  rows[h - 1][left + 1] = 0;
  return rows;
})();

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

export function formationWidth(f: Pick<Formation, "cols" | "pitchX">): number {
  return (f.cols - 1) * f.pitchX + SPRITE_W;
}

export function formationHeight(f: Pick<Formation, "rows" | "pitchY">): number {
  return (f.rows - 1) * f.pitchY + SPRITE_H;
}

export function createScene(specs: readonly InvaderSpec[], bounds: SceneBounds, rand: Rand): Scene {
  const span = bounds.right - bounds.left;
  const cols = columnsFor(specs.length, span);
  const rows = Math.max(1, Math.ceil(specs.length / cols));
  const formation: Formation = {
    x: 0,
    y: formationTop(bounds.height),
    dir: 1,
    frame: 0,
    next: STEP_MS,
    cols,
    rows,
    pitchX: CELL_W,
    pitchY: CELL_H,
  };
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

export function freshBunker(): boolean[][] {
  return BUNKER.map((row) => [...row].map((c) => c === "#"));
}

export function placeBunkers(scene: Pick<Scene, "left" | "right" | "height">): Bunker[] {
  const span = scene.right - scene.left;
  const count = Math.max(2, Math.min(4, Math.floor(span / 48)));
  const y = bunkerY(scene);
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(scene.left + ((i + 0.5) * span) / count - BUNKER_W / 2),
    y,
    cells: freshBunker(),
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
  return { x: f.x + invader.col * f.pitchX, y: f.y + invader.row * f.pitchY, w: SPRITE_W, h: SPRITE_H };
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

function wholeFormation(f: Formation): March {
  return { interval: STEP_MS, cols: [0, f.cols - 1], bottom: f.rows - 1, wrap: true };
}

/**
 * One march step: sideways, or down and about-face when the next step would
 * take the outermost live column out of the playfield.
 */
export function stepFormation(
  f: Formation,
  scene: Pick<Scene, "left" | "right" | "height">,
  march: March = wholeFormation(f),
): Formation {
  const [first, last] = march.cols;
  const nextX = f.x + f.dir * STEP_X;
  const frame: 0 | 1 = f.frame === 0 ? 1 : 0;
  const next = f.next + march.interval;
  if (nextX + first * f.pitchX < scene.left || nextX + last * f.pitchX + SPRITE_W > scene.right) {
    const y = f.y + STEP_Y;
    const bottom = y + march.bottom * f.pitchY + SPRITE_H;
    const restart = march.wrap && bottom > bunkerY(scene) - 6;
    return { ...f, y: restart ? formationTop(scene.height) : y, dir: f.dir === 1 ? -1 : 1, frame, next };
  }
  return { ...f, x: nextX, frame, next };
}

/** A hash's strength: `CLZ_MIN` bits or more, each further bit half as likely, as in mining. */
export function drawClz(rand: Rand): number {
  let clz = CLZ_MIN;
  while (clz < CLZ_MAX && rand() < 0.5) clz++;
  return clz;
}

/** A hash with `clz` leading zero bits, as the shot's text: zeros, then a tail. */
export function shotHash(clz: number, rand: Rand, tail = SHOT_TAIL): { text: string; zeros: number } {
  const zeros = Math.floor(clz / 4);
  // The first character after the zeros is bounded by the remaining zero bits.
  // Exactly `clz` zero bits: the next nibble has its first one bit where the
  // count stops, so it lies in [8 >> rest, 16 >> rest).
  const rest = clz % 4;
  const first = (8 >> rest) + Math.floor(rand() * (8 >> rest));
  let text = first.toString(16);
  for (let i = 1; i < tail; i++) text += Math.floor(rand() * 16).toString(16);
  return { text: "0".repeat(zeros) + text, zeros };
}

/**
 * Remove the bunker cell under a point, and a neighbour or two further along
 * the projectile's way (`dir` −1 going up, 1 coming down), so a shot bores up
 * from underneath and a bomb bites down from above. Returns true on a hit.
 */
export function erode(bunker: Bunker, x: number, y: number, rand: Rand, dir: -1 | 1 = -1): boolean {
  const cx = Math.floor(x - bunker.x);
  const cy = Math.floor(y - bunker.y);
  if (!solid(bunker, cx, cy)) return false;
  bunker.cells[cy][cx] = false;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, dir], [-1, dir], [1, dir]]) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (solid(bunker, nx, ny) && rand() < 0.45) bunker.cells[ny][nx] = false;
  }
  return true;
}

function solid(bunker: Bunker, cx: number, cy: number): boolean {
  return cy >= 0 && cy < BUNKER_H && cx >= 0 && cx < BUNKER_W && bunker.cells[cy][cx];
}

/** Clear every bunker cell a rectangle covers: an invader marching through cover. */
export function scour(bunker: Bunker, rect: Rect): void {
  for (let cy = Math.max(0, rect.y - bunker.y); cy < Math.min(BUNKER_H, rect.y + rect.h - bunker.y); cy++) {
    for (let cx = Math.max(0, rect.x - bunker.x); cx < Math.min(BUNKER_W, rect.x + rect.w - bunker.x); cx++) {
      bunker.cells[cy][cx] = false;
    }
  }
}

function bunkerLeft(bunker: Bunker): number {
  return bunker.cells.flat().filter(Boolean).length;
}

/** Height of a shot in cells: one glyph per character, one cell between. */
export function shotLength(shot: Pick<Shot, "text">): number {
  return shot.text.length * (GLYPH_H + 1) - 1;
}

/**
 * Visit each whole row a point crosses moving from `from` to `to`, in order,
 * until `visit` says it struck something. A fast shot moves several cells per
 * step; testing only where it lands would let it pass through thin cover.
 */
export function sweep(from: number, to: number, visit: (y: number) => boolean): number | null {
  const dir = Math.sign(to - from);
  let y = from;
  for (; dir > 0 ? y <= to : y >= to; y += dir) {
    if (visit(y)) return y;
    if (dir === 0) return null;
  }
  // The last whole step fell short of `to`: test where it actually ends.
  return y - dir !== to && visit(to) ? to : null;
}

/**
 * Move a shot up by `distance`, testing its tip against the bunkers and then
 * whatever `strike` knows about. Returns false once the shot is spent.
 */
export function flyShot(scene: Scene, shot: Shot, distance: number, rand: Rand, strike: (x: number, y: number) => boolean): boolean {
  const tipX = shot.x + 1;
  const from = shot.y;
  shot.y -= distance;
  const hit = sweep(from, shot.y, (y) => scene.bunkers.some((b) => erode(b, tipX, y, rand, -1)) || strike(tipX, y));
  if (hit !== null) return false;
  return shot.y + shotLength(shot) >= 0;
}

/** The sky: stars fall, and a star leaving the bottom comes back in at the top. */
export function stepStars(scene: Scene, dt: number, rand: Rand): void {
  for (const star of scene.stars) {
    star.y += star.speed * dt;
    if (star.y >= scene.height) {
      star.y -= scene.height;
      star.x = Math.floor(rand() * scene.width);
    }
  }
}

/** Debris falls and fades; scores float up and fade. */
export function stepEffects(scene: Scene, dt: number): void {
  const t = scene.time;
  scene.particles = scene.particles.filter((p) => t - p.born < PARTICLE_MS);
  for (const p of scene.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += GRAVITY * dt;
  }
  scene.popups = scene.popups.filter((p) => t - p.born < POPUP_MS);
}

/** Advance the attract scene by `dt` milliseconds. Mutates and returns the scene. */
export function stepScene(scene: Scene, dt: number, rand: Rand): Scene {
  const t = (scene.time += dt);
  stepStars(scene, dt, rand);

  while (scene.formation.next <= t) scene.formation = stepFormation(scene.formation, scene);

  for (const inv of scene.invaders) {
    if (inv.deadUntil > 0 && inv.deadUntil <= t && inv.flashUntil < inv.deadUntil) inv.flashUntil = inv.deadUntil + FLASH_MS;
  }

  stepCannon(scene, dt, rand);

  scene.shots = scene.shots.filter((shot) =>
    flyShot(scene, shot, SHOT_SPEED * dt, rand, (x, y) => {
      const hit = invaderAt(scene, x, y);
      if (hit < 0) return false;
      explode(scene, hit, shot.clz, rand, t + RESPAWN_MS);
      return true;
    }),
  );

  // A bunker shot to rubble is rebuilt, so the scene never runs out of cover.
  for (const bunker of scene.bunkers) {
    if (bunkerLeft(bunker) < 12) bunker.cells = freshBunker();
  }

  stepEffects(scene, dt);
  return scene;
}

function stepCannon(scene: Scene, dt: number, rand: Rand): void {
  const c = scene.cannon;
  const living = scene.invaders.filter((inv) => alive(inv, scene.time));
  const reached = Math.abs(c.x - c.target) < 1;
  if (reached && living.length > 0 && scene.time - c.lastShot >= FIRE_COOLDOWN_MS) {
    const clz = drawClz(rand);
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

/** Scatter debris over a rectangle, in its tint with a few white sparks. */
export function burst(scene: Scene, rect: Rect, tint: Tint, rand: Rand, count = 16): void {
  for (let i = 0; i < count; i++) {
    scene.particles.push({
      x: rect.x + rand() * rect.w,
      y: rect.y + rand() * rect.h,
      vx: (rand() - 0.5) * 0.09,
      vy: -rand() * 0.07,
      born: scene.time,
      tint: rand() < 0.25 ? "ink" : tint,
    });
  }
}

/** The popup a hit on a launch shows: what the hash would mint there, in its symbol. */
export function rewardText(tokens: number, symbol: string): string {
  return `+${group(tokens)} ${symbol}`;
}

/**
 * An invader hit by a hash of `clz` bits: it bursts, its reward floats up, and
 * it stays down until `until`. Returns the whole tokens that hash mints.
 */
export function explode(scene: Scene, index: number, clz: number, rand: Rand, until: number): number {
  const inv = scene.invaders[index];
  const rect = invaderRect(scene, inv);
  inv.deadUntil = until;
  inv.flashUntil = 0;
  scene.hits++;
  burst(scene, rect, inv.spec, rand);
  const spec = scene.specs[inv.spec];
  const tokens = spec.reward(clz);
  scene.popups.push({ x: rect.x + SPRITE_W / 2, y: rect.y, text: rewardText(tokens, spec.symbol), tint: inv.spec, born: scene.time });
  return tokens;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export const TIMING = { POPUP_MS, PARTICLE_MS, FLASH_MS, RESPAWN_MS } as const;
export const CANNON_SIZE = { w: CANNON_W, h: CANNON_H } as const;
export const BUNKER_SIZE = { w: BUNKER_W, h: BUNKER_H } as const;
export const CLZ_RANGE = { min: CLZ_MIN, max: CLZ_MAX } as const;

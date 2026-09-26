/* The attract mode's rules: build a scene, then advance it by a time step —
 * the formation marches, the cannon aims ahead and fires, hits burst into
 * debris and a floating reward, and bunkers shot to rubble are rebuilt. The
 * pieces `game/` reuses (march, explode, sky, effects) live here too. */

import { group } from "@/ui/format";
import { bunkerLeft, bunkerY, freshBunker, placeBunkers } from "./bunker";
import { alive, CANNON_W, cannonY, CELL_H, CELL_W, clamp, columnsFor, formationTop, formationWidth, invaderAt, invaderRect, SPRITE_H, SPRITE_W, STEP_MS, STEP_X, STEP_Y } from "./geometry";
import { drawClz, flyShot, SHOT_SPEED, shotHash, shotLength } from "./shots";
import type { Formation, InvaderSpec, March, Rand, Rect, Scene, SceneBounds, Star, Tint } from "./types";

const CANNON_SPEED = 0.07; // cells per ms
const FIRE_COOLDOWN_MS = 1150;
export const RESPAWN_MS = 1700;
export const FLASH_MS = 420;
export const POPUP_MS = 1100;
export const PARTICLE_MS = 700;
const GRAVITY = 0.00018; // cells per ms²

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

/* Drawing the arcade onto a canvas: the shared world, the game's layer on top
 * of it, and the screens between games.
 *
 * Everything is filled rectangles on an integer grid: one scene cell is `s`
 * device pixels, so every pixel of every sprite, glyph and particle lands on
 * whole device pixels and stays square at any zoom. Colours arrive resolved
 * from the theme's tokens (`ArcadeScene.tsx`); nothing here names one.
 */

import { group } from "@/ui/format";
import type { PixelGrid } from "@/ui/pixels/pixels";
import { fromBitmap } from "@/ui/pixels/pixels";
import { ADVANCE, glyph, GLYPH_H, textWidth } from "./font";
import { bombRect, canRestart, HUD_Y, UFO_SIZE, UFO_Y, ufoRect, type Game } from "./game";
import { alive, CANNON, cannonY, groundY, invaderRect, SPRITE_W } from "./scene/geometry";
import { CANNON_SIZE, TIMING, type Scene, type Tint } from "./scene";

export interface ScenePalette {
  bg: string;
  ink: string;
  dim: string;
  faint: string;
  /** The cannon, and the zeros of every hash: Bitcoin's colour. */
  bitcoin: string;
  /** Bunkers and the ground. */
  cover: string;
  /** Per launch, in scene order: its accent and the accent's highlight. */
  invaders: ReadonlyArray<{ base: string; hi: string }>;
}

/** The mystery ship: a saucer, lights along its rim. */
const UFO: PixelGrid = fromBitmap([
  ".....######.....",
  "...##########...",
  "..############..",
  ".##.##.##.##.##.",
  "################",
  "..###..##..###..",
  "...#........#...",
]);

/** A life in reserve: the cannon, small. */
const LIFE: PixelGrid = fromBitmap(["...#...", "..###..", "#######", "#######"]);

/** A bomb's two frames: a zigzag that wriggles as it falls. */
const BOMB: readonly [PixelGrid, PixelGrid] = [
  fromBitmap([".#.", "#..", ".#.", "..#", ".#.", "#.."]),
  fromBitmap([".#.", "..#", ".#.", "#..", ".#.", "..#"]),
];

function cells(ctx: CanvasRenderingContext2D, grid: PixelGrid, x: number, y: number, s: number, color: (cell: number) => string | null): void {
  grid.forEach((row, gy) =>
    row.forEach((cell, gx) => {
      if (!cell) return;
      const fill = color(cell);
      if (!fill) return;
      ctx.fillStyle = fill;
      ctx.fillRect((x + gx) * s, (y + gy) * s, s, s);
    }),
  );
}

/** A line of text in the pixel font; `scale` makes each glyph cell a block of cells. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, color: string, scale = 1): void {
  ctx.fillStyle = color;
  const k = s * scale;
  [...text].forEach((ch, i) => {
    glyph(ch).forEach((row, gy) =>
      row.forEach((on, gx) => {
        if (on) ctx.fillRect(x * s + (i * ADVANCE + gx) * k, y * s + gy * k, k, k);
      }),
    );
  });
}

/** Text on a solid plate of the background colour, so it reads cleanly over
 *  stars and sprites alike — the way an arcade prints a score over the play. */
function label(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, s: number, color: string, bg: string, scale = 1): void {
  const w = textWidth(text) * scale;
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = bg;
  ctx.fillRect((x - 1) * s, (y - 1) * s, (w + 2) * s, (GLYPH_H * scale + 2) * s);
  drawText(ctx, text, x, y, s, color, scale);
}

/** Rows at the top the page's own HUD is printed over in the attract mode. */
const HUD_CELLS = 14;

/** Quantised fade: four steps of alpha, like a palette-limited fade-out. */
function fade(age: number, life: number): number {
  return Math.max(0, Math.ceil((1 - age / life) * 4) / 4);
}

function tint(palette: ScenePalette, t: Tint): string {
  return t === "ink" ? palette.ink : t === "bitcoin" ? palette.bitcoin : palette.invaders[t].base;
}

export interface WorldView {
  /** Invader under the pointer, to name it; -1 for none. */
  hovered: number;
  cannon: "show" | "blink" | "hide";
  /** Highest row a floating score may rise to. */
  ceiling: number;
}

/** The world both modes share: sky, cover, the formation, hashes, the cannon, debris and scores. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  palette: ScenePalette,
  s: number,
  view: WorldView = { hovered: -1, cannon: "show", ceiling: HUD_CELLS },
): void {
  const t = scene.time;
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, scene.width * s, scene.height * s);

  // Stars: three depths, the nearest twinkling.
  scene.stars.forEach((star, i) => {
    if (star.layer === 2 && Math.floor(t / 180 + i) % 7 === 0) return;
    ctx.fillStyle = star.layer === 0 ? palette.faint : star.layer === 1 ? palette.dim : palette.ink;
    ctx.fillRect(star.x * s, Math.floor(star.y) * s, s, s);
  });

  // Ground.
  ctx.fillStyle = palette.cover;
  ctx.fillRect(scene.left * s, groundY(scene) * s, (scene.right - scene.left) * s, s);

  for (const bunker of scene.bunkers) {
    ctx.fillStyle = palette.cover;
    bunker.cells.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) ctx.fillRect((bunker.x + x) * s, (bunker.y + y) * s, s, s);
      }),
    );
  }

  const frame = scene.formation.frame;
  scene.invaders.forEach((inv) => {
    if (!alive(inv, t)) return;
    const r = invaderRect(scene, inv);
    const colours = palette.invaders[inv.spec];
    const flashing = inv.flashUntil > t && Math.floor(t / 80) % 2 === 0;
    cells(ctx, scene.specs[inv.spec].frames[frame], r.x, r.y, s, (cell) =>
      flashing ? palette.ink : cell === 2 ? colours.hi : colours.base,
    );
  });

  // A hash leaves the barrel rather than appearing whole above it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, scene.width * s, cannonY(scene) * s);
  ctx.clip();
  for (const shot of scene.shots) {
    [...shot.text].forEach((ch, i) => {
      drawText(ctx, ch, shot.x, Math.round(shot.y) + i * (GLYPH_H + 1), s, i < shot.zeros ? palette.bitcoin : palette.dim);
    });
  }
  ctx.restore();

  if (view.cannon === "show" || (view.cannon === "blink" && Math.floor(t / 100) % 2 === 0)) {
    cells(ctx, CANNON, Math.round(scene.cannon.x - CANNON_SIZE.w / 2), cannonY(scene), s, () => palette.bitcoin);
  }

  for (const p of scene.particles) {
    ctx.globalAlpha = fade(t - p.born, TIMING.PARTICLE_MS);
    ctx.fillStyle = tint(palette, p.tint);
    ctx.fillRect(Math.round(p.x) * s, Math.round(p.y) * s, s, s);
  }

  for (const p of scene.popups) {
    const age = t - p.born;
    ctx.globalAlpha = fade(age, TIMING.POPUP_MS);
    const rise = Math.floor((age / TIMING.POPUP_MS) * 12);
    label(ctx, p.text, p.x, Math.max(view.ceiling, Math.round(p.y - 8 - rise)), s, tint(palette, p.tint), palette.bg);
  }
  ctx.globalAlpha = 1;

  const hovered = scene.invaders[view.hovered];
  if (hovered && alive(hovered, t)) {
    const r = invaderRect(scene, hovered);
    label(ctx, scene.specs[hovered.spec].symbol, r.x + SPRITE_W / 2, r.y + r.h + 2, s, palette.ink, palette.bg);
  }

  if (scene.invaders.length === 0 && Math.floor(t / 600) % 2 === 0) {
    label(ctx, "AWAITING PLAYERS", (scene.left + scene.right) / 2, Math.round(scene.height / 2 - 12), s, palette.dim, palette.bg);
  }
}

/** How the screens between plays are worded: by keyboard, or by touch. */
export type Pointer = "keys" | "touch";

/** Whether a blinking line is lit now: steady when motion is reduced. */
function lit(t: number, still: boolean): boolean {
  return still || Math.floor(t / 500) % 2 === 0;
}

/** A framed panel of centred lines in the middle of the playfield. */
function panel(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  palette: ScenePalette,
  s: number,
  lines: ReadonlyArray<{ text: string; color: string; scale?: number } | null>,
): void {
  const shown = lines.filter((l): l is { text: string; color: string; scale?: number } => l !== null);
  const gap = 4;
  const height = shown.reduce((h, l) => h + GLYPH_H * (l.scale ?? 1) + gap, -gap);
  const width = Math.max(...shown.map((l) => textWidth(l.text) * (l.scale ?? 1)));
  const cx = (scene.left + scene.right) / 2;
  const top = Math.round(scene.height * 0.46 - height / 2);
  const pad = 6;
  const x0 = Math.round(cx - width / 2 - pad);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.cover;
  ctx.fillRect((x0 - 1) * s, (top - pad - 1) * s, (width + 2 * pad + 2) * s, (height + 2 * pad + 2) * s);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(x0 * s, (top - pad) * s, (width + 2 * pad) * s, (height + 2 * pad) * s);
  let y = top;
  for (const line of shown) {
    const scale = line.scale ?? 1;
    drawText(ctx, line.text, Math.round(cx - (textWidth(line.text) * scale) / 2), y, s, line.color, scale);
    y += GLYPH_H * scale + gap;
  }
}

/** The attract scene, waiting for a player who has picked up the controls. */
export function drawReady(ctx: CanvasRenderingContext2D, scene: Scene, palette: ScenePalette, s: number, still: boolean): void {
  if (scene.invaders.length === 0) return;
  panel(ctx, scene, palette, s, [
    { text: "PLAYER 1", color: palette.bitcoin },
    { text: "PRESS SPACE / TAP TO START", color: lit(scene.time, still) ? palette.ink : palette.bg },
  ]);
}

/** The game: the world, then bombs, the mystery ship, the score line, and whatever screen the phase calls for. */
export function drawGame(ctx: CanvasRenderingContext2D, game: Game, palette: ScenePalette, s: number, pointer: Pointer): void {
  const scene = game.scene;
  const t = scene.time;
  const phase = game.phase.kind === "paused" ? game.phase.resume : game.phase;
  const cannon = phase.kind === "dying" || game.phase.kind === "over" ? "hide" : t < game.safeUntil ? "blink" : "show";
  drawScene(ctx, scene, palette, s, { hovered: -1, cannon, ceiling: HUD_Y + GLYPH_H + 3 });

  const bombFrame = Math.floor(t / 90) % 2;
  for (const bomb of game.bombs) {
    const r = bombRect(bomb);
    cells(ctx, BOMB[bombFrame], r.x, r.y, s, () => palette.invaders[bomb.spec].base);
  }

  if (game.ufo) {
    const r = ufoRect(game.ufo);
    const lights = Math.floor(t / 120) % 3;
    cells(ctx, UFO, r.x, r.y, s, () => palette.bitcoin);
    // The rim lights chase round, one in three dark.
    ctx.fillStyle = palette.bg;
    for (let x = 1 + lights; x < UFO_SIZE.w; x += 3) ctx.fillRect((r.x + x) * s, (r.y + 3) * s, s, s);
    const text = `BLOCK ${group(game.ufo.block)}`;
    const cx = Math.min(scene.right - textWidth(text) / 2, Math.max(scene.left + textWidth(text) / 2, r.x + UFO_SIZE.w / 2));
    drawText(ctx, text, Math.round(cx - textWidth(text) / 2), UFO_Y + UFO_SIZE.h + 2, s, palette.dim);
  }

  drawHud(ctx, game, palette, s);

  switch (game.phase.kind) {
    case "intro":
      panel(ctx, scene, palette, s, [
        { text: `WAVE ${game.wave}`, color: palette.bitcoin, scale: 2 },
        { text: "SCORE = TOKENS YOUR HASHES MINT", color: palette.dim },
      ]);
      break;
    case "paused":
      panel(ctx, scene, palette, s, [
        { text: "PAUSED", color: palette.ink, scale: 2 },
        { text: pointer === "touch" ? "TAP TO RESUME" : "P TO RESUME", color: palette.dim },
      ]);
      break;
    case "over": {
      const ready = canRestart(game);
      panel(ctx, scene, palette, s, [
        game.phase.cause === "invaded" ? { text: "THEY LANDED", color: palette.dim } : null,
        { text: "GAME OVER", color: palette.ink, scale: 2 },
        { text: `SCORE ${group(game.score)}`, color: palette.bitcoin },
        game.phase.record && lit(t, false) ? { text: "NEW HI-SCORE!", color: palette.bitcoin } : { text: `HI ${group(game.hi)}`, color: palette.dim },
        ready && lit(t, false) ? { text: "INSERT COIN", color: palette.ink } : { text: " ", color: palette.bg },
        ready ? { text: pointer === "touch" ? "TAP TO PLAY AGAIN" : "PRESS ENTER", color: palette.dim } : { text: " ", color: palette.bg },
      ]);
      break;
    }
    default:
      break;
  }
}

function drawHud(ctx: CanvasRenderingContext2D, game: Game, palette: ScenePalette, s: number): void {
  const { left, right } = game.scene;
  const y = HUD_Y;
  drawText(ctx, "SCORE", left, y, s, palette.dim);
  drawText(ctx, group(game.score), left + textWidth("SCORE ") + 1, y, s, palette.ink);

  const hi = group(game.hi);
  const hiWidth = textWidth(`HI ${hi}`);
  const hx = Math.round((left + right - hiWidth) / 2);
  drawText(ctx, "HI", hx, y, s, palette.bitcoin);
  drawText(ctx, hi, hx + textWidth("HI ") + 1, y, s, palette.ink);

  const lifeW = LIFE[0].length;
  let x = right - lifeW;
  for (let i = 0; i < game.lives; i++) {
    cells(ctx, LIFE, x, y + 1, s, () => palette.bitcoin);
    x -= lifeW + 2;
  }
  const wave = `W${game.wave}`;
  drawText(ctx, wave, x - textWidth(wave) + lifeW - 2, y, s, palette.dim);
}

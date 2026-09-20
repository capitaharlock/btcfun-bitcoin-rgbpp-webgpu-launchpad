import { describe, expect, it } from "vitest";

import { pixelSigil } from "../pixelSigil";
import {
  bombRect,
  canRestart,
  createGame,
  EXTRA_LIFE_EVERY,
  FIELD_MAX,
  GAME_TIMING,
  gameBounds,
  GAME_TOP,
  IDLE,
  living,
  marchInterval,
  stepGame,
  togglePause,
  ufoRect,
  waveGrid,
  type Controls,
  type Game,
} from "./game";
import {
  bunkerY,
  CANNON_SIZE,
  cannonY,
  formationHeight,
  formationWidth,
  invaderRect,
  seeded,
  SPRITE_W,
  STEP_Y,
  stepFormation,
  type InvaderSpec,
} from "./scene";

/** A long simulation outruns the default timeout when the whole suite shares the CPU. */
const SIMULATION_MS = 30_000;

const spec = (i: number): InvaderSpec => ({
  id: `l${i}`,
  symbol: `T${i}`,
  frames: pixelSigil(`l${i}`).frames,
  reward: (clz) => clz * clz,
});

const specs = [spec(0), spec(1), spec(2)];
const bounds = gameBounds(260, 140);

function game(seed = 1): Game {
  return createGame(specs, bounds, seeded(seed), { hi: 0, block: 5_150_902 });
}

/** A game past its intro, with nothing random scheduled to interfere. */
function playing(seed = 1): Game {
  const g = game(seed);
  stepGame(g, GAME_TIMING.INTRO_MS, IDLE, seeded(seed));
  g.nextBomb = Infinity;
  g.nextUfo = Infinity;
  g.scene.formation.next = Infinity;
  g.events = [];
  return g;
}

const press = (over: Partial<Controls>): Controls => ({ ...IDLE, ...over });

describe("a new game", () => {
  it("starts on a centred field no wider than FIELD_MAX, with three lives and a full formation", () => {
    expect(bounds.right - bounds.left).toBe(260 - 8);
    expect(bounds.left).toBe(4);
    const wide = gameBounds(1000, 140);
    expect(wide.right - wide.left).toBe(FIELD_MAX);
    expect(wide.left).toBe((1000 - FIELD_MAX) / 2);
    const g = game();
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    expect(g.wave).toBe(1);
    expect(g.phase.kind).toBe("intro");
    const f = g.scene.formation;
    expect(f.cols).toBe(11);
    expect(f.rows).toBe(5);
    expect(g.total).toBe(55);
    expect(f.x).toBeGreaterThanOrEqual(bounds.left);
    expect(f.x + formationWidth(f)).toBeLessThanOrEqual(bounds.right);
    expect(f.y).toBe(GAME_TOP);
    expect(f.y + formationHeight(f)).toBeLessThan(bunkerY(g.scene));
  });

  it("gives each row one launch, rotating through all of them", () => {
    const g = game();
    const rowSpecs = [...new Set(g.scene.invaders.map((inv) => `${inv.row}:${inv.spec}`))];
    expect(rowSpecs).toEqual(["0:0", "1:1", "2:2", "3:0", "4:1"]);
  });

  it("fits fewer rows on a short screen, and never none", () => {
    expect(waveGrid(gameBounds(260, 100)).rows).toBeLessThan(5);
    expect(waveGrid(gameBounds(60, 40))).toEqual({ cols: expect.any(Number), rows: 1 });
  });

  it("needs a launch to play", () => {
    expect(() => createGame([], bounds, seeded(1), { hi: 0, block: 1 })).toThrow();
  });
});

describe("the player", () => {
  it("holds fire during the intro, then plays", () => {
    const g = game();
    stepGame(g, 16, press({ fire: true }), seeded(1));
    expect(g.scene.shots).toHaveLength(0);
    stepGame(g, GAME_TIMING.INTRO_MS, IDLE, seeded(1));
    expect(g.phase.kind).toBe("playing");
  });

  it("moves left and right, and stops at the edges", () => {
    const g = playing();
    const x0 = g.scene.cannon.x;
    stepGame(g, 100, press({ left: true }), seeded(1));
    expect(g.scene.cannon.x).toBeLessThan(x0);
    for (let i = 0; i < 200; i++) stepGame(g, 16, press({ left: true }), seeded(1));
    expect(g.scene.cannon.x).toBe(g.scene.left + CANNON_SIZE.w / 2);
    for (let i = 0; i < 400; i++) stepGame(g, 16, press({ right: true }), seeded(1));
    expect(g.scene.cannon.x).toBe(g.scene.right - CANNON_SIZE.w / 2);
  });

  it("follows a finger at the cannon's own speed", () => {
    const g = playing();
    const target = g.scene.cannon.x + 30;
    stepGame(g, 16, press({ aim: target }), seeded(1));
    expect(g.scene.cannon.x).toBeGreaterThan(target - 30);
    expect(g.scene.cannon.x).toBeLessThan(target);
    for (let i = 0; i < 100; i++) stepGame(g, 16, press({ aim: target }), seeded(1));
    expect(g.scene.cannon.x).toBeCloseTo(target, 5);
  });

  it("has one hash in flight at a time", () => {
    const g = playing();
    stepGame(g, 16, press({ fire: true }), seeded(1));
    stepGame(g, 16, press({ fire: true }), seeded(1));
    expect(g.scene.shots).toHaveLength(1);
    expect(g.events.filter((e) => e.kind === "fire")).toHaveLength(1);
    expect(g.scene.shots[0].text.startsWith("0000")).toBe(true);
  });
});

describe("scoring", () => {
  it("scores what the hash would mint on the launch it hits, and the invader stays down", () => {
    const g = playing();
    const target = g.scene.invaders.find((inv) => inv.row === 4 && inv.col === 5)!;
    const r = invaderRect(g.scene, target);
    g.scene.shots.push({ x: r.x + 4, y: r.y + r.h + 1, text: "00008", zeros: 4, clz: 16 });
    stepGame(g, 16, IDLE, seeded(1));
    expect(target.deadUntil).toBe(Infinity);
    expect(g.score).toBe(16 * 16);
    expect(g.hi).toBe(256);
    expect(g.scene.popups.at(-1)?.text).toBe(`+256 ${specs[target.spec].symbol}`);
    expect(living(g.scene)).toHaveLength(54);
    stepGame(g, 60_000, IDLE, seeded(1));
    expect(target.deadUntil).toBe(Infinity);
  });

  it("adds a life every EXTRA_LIFE_EVERY points", () => {
    const g = playing();
    g.score = EXTRA_LIFE_EVERY - 10;
    const target = g.scene.invaders.find((inv) => inv.row === 4)!;
    const r = invaderRect(g.scene, target);
    g.scene.shots.push({ x: r.x + 4, y: r.y + r.h + 1, text: "00008", zeros: 4, clz: 16 });
    stepGame(g, 16, IDLE, seeded(1));
    expect(g.lives).toBe(4);
    expect(g.nextLife).toBe(2 * EXTRA_LIFE_EVERY);
    expect(g.events.some((e) => e.kind === "extraLife")).toBe(true);
  });

  it("pays the mystery block's bonus and labels it with the next block", () => {
    const g = playing();
    g.nextUfo = 0;
    stepGame(g, 16, IDLE, seeded(1));
    expect(g.ufo).not.toBeNull();
    expect(g.ufo!.block).toBe(5_150_902);
    const bonus = g.ufo!.bonus;
    g.ufo!.x = g.scene.cannon.x - 8;
    const r = ufoRect(g.ufo!);
    g.scene.shots.push({ x: Math.round(g.scene.cannon.x) - 1, y: r.y + r.h + 1, text: "00008", zeros: 4, clz: 16 });
    stepGame(g, 16, IDLE, seeded(1));
    expect(g.ufo).toBeNull();
    expect(g.score).toBe(bonus);
    expect(g.scene.popups.at(-1)?.text).toMatch(/BLOCK$/);
  });
});

describe("the formation", () => {
  it("marches faster as it thins, and faster again each wave", () => {
    const g = game();
    const full = marchInterval(g, 55);
    const half = marchInterval(g, 27);
    const last = marchInterval(g, 1);
    expect(half).toBeLessThan(full);
    expect(last).toBeLessThan(half);
    expect(marchInterval({ ...g, wave: 3 }, 55)).toBeLessThan(full);
  });

  it("turns at its outermost live column, not its original edge", () => {
    const g = game();
    const f = g.scene.formation;
    const march = (cols: readonly [number, number]) => ({ interval: 100, cols, bottom: f.rows - 1, wrap: false });
    // Park it so the full formation touches the right edge.
    const atEdge = { ...f, x: g.scene.right - formationWidth(f) - 1 };
    expect(stepFormation(atEdge, g.scene, march([0, f.cols - 1])).dir).toBe(-1);
    expect(stepFormation(atEdge, g.scene, march([0, f.cols - 3])).dir).toBe(1);
  });

  it("drops bombs that bite cover from above", () => {
    const g = playing();
    const b = g.scene.bunkers[0];
    const before = b.cells.flat().filter(Boolean).length;
    g.bombs.push({ x: b.x + 4, y: b.y - 8, spec: 0 });
    for (let i = 0; i < 20 && g.bombs.length; i++) stepGame(g, 16, IDLE, seeded(2));
    expect(g.bombs).toHaveLength(0);
    expect(b.cells.flat().filter(Boolean).length).toBeLessThan(before);
    expect(b.cells[0][5]).toBe(false);
  });

  it("marching into the cannon's row ends the game at once", () => {
    const g = playing();
    g.scene.formation.y = cannonY(g.scene) - formationHeight(g.scene.formation) + 1;
    stepGame(g, 16, IDLE, seeded(1));
    expect(g.phase).toMatchObject({ kind: "dying", cause: "invaded" });
    expect(g.lives).toBe(0);
    stepGame(g, GAME_TIMING.DYING_MS, IDLE, seeded(1));
    expect(g.phase).toMatchObject({ kind: "over", cause: "invaded" });
  });
});

describe("lives and waves", () => {
  function bombCannon(g: Game): void {
    const c = g.scene.cannon;
    g.bombs.push({ x: Math.round(c.x) - 1, y: cannonY(g.scene) - 8, spec: 1 });
  }

  it("a bomb costs a life, and the cannon comes back briefly untouchable", () => {
    const g = playing();
    bombCannon(g);
    for (let i = 0; i < 30 && g.phase.kind === "playing"; i++) stepGame(g, 16, IDLE, seeded(1));
    expect(g.phase.kind).toBe("dying");
    expect(g.lives).toBe(2);
    expect(g.events.some((e) => e.kind === "playerHit")).toBe(true);
    stepGame(g, GAME_TIMING.DYING_MS, IDLE, seeded(1));
    expect(g.phase.kind).toBe("playing");
    expect(g.safeUntil).toBeGreaterThan(g.scene.time);
    g.nextBomb = Infinity;
    g.scene.formation.next = Infinity;
    bombCannon(g);
    for (let i = 0; i < 30; i++) stepGame(g, 16, IDLE, seeded(1));
    expect(g.lives).toBe(2);
    expect(g.phase.kind).toBe("playing");
  });

  it("the last life ends the game, and a beaten hi-score is a record", () => {
    const g = createGame(specs, bounds, seeded(1), { hi: 100, block: 1 });
    stepGame(g, GAME_TIMING.INTRO_MS, IDLE, seeded(1));
    g.nextBomb = Infinity;
    g.scene.formation.next = Infinity;
    g.lives = 1;
    g.score = 150;
    g.hi = 150;
    bombCannon(g);
    for (let i = 0; i < 30 && g.phase.kind === "playing"; i++) stepGame(g, 16, IDLE, seeded(1));
    stepGame(g, GAME_TIMING.DYING_MS, IDLE, seeded(1));
    expect(g.phase).toMatchObject({ kind: "over", cause: "shot", record: true });
    expect(g.events.some((e) => e.kind === "over")).toBe(true);
    expect(canRestart(g)).toBe(false);
    stepGame(g, GAME_TIMING.OVER_HOLD_MS, IDLE, seeded(1));
    expect(canRestart(g)).toBe(true);
  });

  it("clearing a wave brings the next one, lower and faster, with the cover rebuilt", () => {
    const g = playing();
    const y1 = g.scene.formation.y;
    const interval1 = marchInterval(g, g.total);
    g.scene.bunkers[0].cells[0].fill(false);
    for (const inv of g.scene.invaders) inv.deadUntil = Infinity;
    stepGame(g, 16, IDLE, seeded(1));
    expect(g.wave).toBe(2);
    expect(g.phase.kind).toBe("intro");
    expect(living(g.scene)).toHaveLength(g.total);
    expect(g.scene.formation.y).toBe(y1 + STEP_Y);
    expect(marchInterval(g, g.total)).toBeLessThan(interval1);
    expect(g.scene.bunkers[0].cells[0].some(Boolean)).toBe(true);
    // The rows move on through the catalogue.
    expect(g.scene.invaders.find((inv) => inv.row === 0)!.spec).toBe(5 % specs.length);
  });
});

describe("pause", () => {
  it("freezes the game where it is and resumes the same moment", () => {
    const g = playing();
    const t = g.scene.time;
    togglePause(g);
    expect(g.phase).toEqual({ kind: "paused", resume: { kind: "playing" } });
    stepGame(g, 5_000, press({ left: true, fire: true }), seeded(1));
    expect(g.scene.time).toBe(t);
    expect(g.scene.shots).toHaveLength(0);
    togglePause(g);
    expect(g.phase.kind).toBe("playing");
  });

  it("does not pause a finished game", () => {
    const g = playing();
    g.phase = { kind: "over", at: g.scene.time, cause: "shot", record: false };
    togglePause(g);
    expect(g.phase.kind).toBe("over");
  });
});

describe("a whole game", () => {
  it("plays to the end under random input, deterministically for a seed", () => {
    const run = () => {
      const g = game(9);
      const rand = seeded(9);
      const input = seeded(10);
      for (let i = 0; i < 60 * 60 * 5 && g.phase.kind !== "over"; i++) {
        const r = input();
        stepGame(g, 1000 / 60, press({ left: r < 0.3, right: r > 0.7, fire: input() < 0.5 }), rand);
        if (i % 10 === 0) for (const inv of living(g.scene)) {
          const rect = invaderRect(g.scene, inv);
          expect(rect.x).toBeGreaterThanOrEqual(g.scene.left);
          expect(rect.x + SPRITE_W).toBeLessThanOrEqual(g.scene.right);
        }
        for (const bomb of g.bombs) expect(bombRect(bomb).y).toBeLessThan(g.scene.height);
      }
      return { score: g.score, wave: g.wave, lives: g.lives, phase: g.phase.kind, time: g.scene.time };
    };
    const a = run();
    expect(a.phase).toBe("over");
    expect(a.score).toBeGreaterThan(0);
    expect(run()).toEqual(a);
  }, SIMULATION_MS);
});

import { describe, expect, it } from "vitest";

import { pixelSigil } from "../pixelSigil";
import { ADVANCE, glyph, GLYPH_H, GLYPH_W, hasGlyph, textWidth } from "./font";
import {
  bunkerY,
  CELL_W,
  columnsFor,
  contains,
  createScene,
  erode,
  formationTop,
  formationWidth,
  invaderAt,
  invaderRect,
  seeded,
  shotHash,
  STEP_MS,
  STEP_X,
  STEP_Y,
  stepFormation,
  stepScene,
  TIMING,
  type InvaderSpec,
  type Scene,
} from "./scene";

const spec = (i: number): InvaderSpec => ({
  id: `l${i}`,
  symbol: `T${i}`,
  frames: pixelSigil(`l${i}`).frames,
  reward: (clz) => String(clz * clz),
});

const bounds = { width: 300, height: 160, left: 100, right: 296 };

function scene(count = 6, seed = 1): Scene {
  return createScene(Array.from({ length: count }, (_, i) => spec(i)), bounds, seeded(seed));
}

describe("formation", () => {
  it("lays out one invader per launch in rows that fit the playfield", () => {
    const s = scene(11);
    expect(s.invaders).toHaveLength(11);
    expect(s.formation.cols).toBe(columnsFor(11, bounds.right - bounds.left));
    expect(s.formation.x).toBeGreaterThanOrEqual(bounds.left);
    expect(s.formation.x + formationWidth(s.formation)).toBeLessThanOrEqual(bounds.right);
    expect(columnsFor(3, 400)).toBe(3);
    expect(columnsFor(40, 60)).toBeGreaterThanOrEqual(1);
  });

  it("marches sideways, flipping frames, then drops and turns at an edge", () => {
    const s = scene(3);
    const f0 = s.formation;
    const f1 = stepFormation(f0, s);
    expect(f1.x).toBe(f0.x + STEP_X);
    expect(f1.y).toBe(f0.y);
    expect(f1.frame).not.toBe(f0.frame);
    const atEdge = { ...f0, x: bounds.right - formationWidth(f0) - 1 };
    const turned = stepFormation(atEdge, s);
    expect(turned.dir).toBe(-1);
    expect(turned.y).toBe(f0.y + STEP_Y);
    expect(turned.x).toBe(atEdge.x);
  });

  it("starts a new wave at the top instead of reaching the bunkers", () => {
    const s = scene(3);
    const low = { ...s.formation, y: bunkerY(s) - 12, x: bounds.right - formationWidth(s.formation) };
    expect(stepFormation(low, s).y).toBe(formationTop(s.height));
  });

  it("never leaves the playfield, however long it marches", () => {
    const s = scene(8, 7);
    for (let i = 0; i < 400; i++) {
      stepScene(s, STEP_MS, seeded(i));
      expect(s.formation.x).toBeGreaterThanOrEqual(bounds.left);
      expect(s.formation.x + formationWidth(s.formation)).toBeLessThanOrEqual(bounds.right);
    }
  });
});

describe("collision", () => {
  it("finds the live invader under a point, and none in the gutters", () => {
    const s = scene(4);
    const r = invaderRect(s, s.invaders[2]);
    expect(contains(r, r.x, r.y)).toBe(true);
    expect(contains(r, r.x + r.w, r.y)).toBe(false);
    expect(invaderAt(s, r.x + 1, r.y + 1)).toBe(2);
    expect(invaderAt(s, r.x - (CELL_W - r.w) / 2, r.y + 1)).toBe(-1);
    s.invaders[2].deadUntil = s.time + 1000;
    expect(invaderAt(s, r.x + 1, r.y + 1)).toBe(-1);
  });

  it("wears a bunker away where it is hit, and only there", () => {
    const s = scene(2);
    const b = s.bunkers[0];
    const before = b.cells.flat().filter(Boolean).length;
    expect(erode(b, b.x + 5, b.y + 2, seeded(3))).toBe(true);
    expect(b.cells[2][5]).toBe(false);
    expect(b.cells.flat().filter(Boolean).length).toBeLessThan(before);
    expect(erode(b, b.x - 1, b.y, seeded(3))).toBe(false);
  });
});

describe("shots and hits", () => {
  it("fire hashes with exactly the claimed leading zero bits", () => {
    const rand = seeded(9);
    for (let clz = 16; clz <= 24; clz++) {
      for (let i = 0; i < 20; i++) {
        const { text, zeros } = shotHash(clz, rand);
        const bits = [...text].map((c) => parseInt(c, 16).toString(2).padStart(4, "0")).join("");
        expect(bits.indexOf("1")).toBe(clz);
        expect(zeros).toBe(Math.floor(clz / 4));
      }
    }
  });

  it("score a hit with the launch's reward, and bring the invader back", () => {
    const s = scene(1, 4);
    let hitAt = -1;
    for (let t = 0; t < 20_000 && hitAt < 0; t += 16) {
      stepScene(s, 16, seeded(t));
      if (s.hits > 0) hitAt = s.time;
    }
    expect(hitAt).toBeGreaterThan(0);
    const popup = s.popups[0];
    expect(popup.text).toMatch(/^\+\d+ T0$/);
    expect(s.particles.length).toBeGreaterThan(0);
    expect(invaderAt(s, invaderRect(s, s.invaders[0]).x + 5, invaderRect(s, s.invaders[0]).y + 4)).toBe(-1);
    for (let t = 0; t < TIMING.RESPAWN_MS + 100; t += 16) stepScene(s, 16, () => 0.99);
    expect(s.invaders[0].deadUntil).toBeLessThanOrEqual(s.time);
    expect(s.invaders[0].flashUntil).toBeGreaterThan(0);
  });

  it("is deterministic for a seed", () => {
    const run = () => {
      const s = scene(5, 12);
      const rand = seeded(12);
      for (let i = 0; i < 300; i++) stepScene(s, 16, rand);
      return JSON.stringify({ f: s.formation, shots: s.shots, hits: s.hits, cannon: s.cannon });
    };
    expect(run()).toBe(run());
  });
});

describe("font", () => {
  it("has a 3×5 glyph for everything a popup or a hash can say", () => {
    for (const ch of "0123456789abcdefABCDEFGHIJKLMNOPQRSTUVWXYZ+-., ") {
      expect(hasGlyph(ch), ch).toBe(true);
      const g = glyph(ch);
      expect(g).toHaveLength(GLYPH_H);
      for (const row of g) expect(row).toHaveLength(GLYPH_W);
    }
    expect(textWidth("+441")).toBe(4 * ADVANCE - 1);
    expect(textWidth("")).toBe(0);
  });
});

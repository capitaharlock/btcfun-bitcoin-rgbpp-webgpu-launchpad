import { describe, expect, it } from "vitest";

import { pixelSigil, SIGIL_HEIGHT, SIGIL_WIDTH, sigilPaths } from "./sigil";
import { fromBitmap, pixelPath } from "./pixels";

const SEEDS = Array.from({ length: 200 }, (_, i) => `seed-${i}`);

describe("pixelSigil", () => {
  it("draws two frames of 11×8 known cells", () => {
    const { frames } = pixelSigil("mesh-0123456789abcdef");
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame).toHaveLength(SIGIL_HEIGHT);
      for (const row of frame) {
        expect(row).toHaveLength(SIGIL_WIDTH);
        for (const cell of row) expect([0, 1, 2]).toContain(cell);
      }
    }
  });

  it("is mirrored about its vertical axis, in both frames", () => {
    for (const seed of ["a", "tide-feedfacecafebeef", "ORBIT", "", ...SEEDS]) {
      for (const frame of pixelSigil(seed).frames) {
        for (const row of frame) expect(row).toEqual([...row].reverse());
      }
    }
  });

  it("is a function of the seed", () => {
    expect(pixelSigil("lumen-1111222233334444")).toEqual(pixelSigil("lumen-1111222233334444"));
    expect(pixelSigil("lumen-1111222233334444")).not.toEqual(pixelSigil("lumen-1111222233334445"));
  });

  it("is never a speck and never a block", () => {
    for (const seed of SEEDS) {
      const lit = pixelSigil(seed).frames[0].flat().filter((c) => c !== 0).length;
      const share = lit / (SIGIL_WIDTH * SIGIL_HEIGHT);
      expect(share).toBeGreaterThanOrEqual(0.3);
      expect(share).toBeLessThanOrEqual(0.72);
    }
  });

  it("has a pair of eyes: a hole in the head with lit cells either side", () => {
    for (const seed of SEEDS) {
      const head = pixelSigil(seed).frames[0].slice(2, 4);
      const eyed = head.some((row) => row.some((c, x) => c === 0 && row[x - 1] > 0 && row[x + 1] > 0));
      expect(eyed, seed).toBe(true);
    }
  });

  it("marches: the second frame moves only the legs", () => {
    for (const seed of SEEDS) {
      const [stand, step] = pixelSigil(seed).frames;
      expect(step.slice(0, 6)).toEqual(stand.slice(0, 6));
    }
    const moving = SEEDS.filter((seed) => {
      const [stand, step] = pixelSigil(seed).frames;
      return JSON.stringify(stand) !== JSON.stringify(step);
    });
    expect(moving.length).toBeGreaterThan(SEEDS.length * 0.95);
  });

  it("draws one unit square per lit cell, split by tone", () => {
    const sprite = pixelSigil("fern-0000000000000000");
    const [{ base, highlight }] = sigilPaths(sprite);
    const count = (path: string) => (path.match(/M/g) ?? []).length;
    expect(count(base)).toBe(sprite.frames[0].flat().filter((c) => c === 1).length);
    expect(count(highlight)).toBe(sprite.frames[0].flat().filter((c) => c === 2).length);
  });
});

describe("pixels", () => {
  it("reads a text bitmap and paths only the lit cells", () => {
    const grid = fromBitmap(["#.", ".#"]);
    expect(grid).toEqual([[1, 0], [0, 1]]);
    expect(pixelPath(grid, 1)).toBe("M0 0h1v1h-1zM1 1h1v1h-1z");
  });
});

import { describe, expect, it } from "vitest";

import type { useMarketActions } from "@/app/hooks/useMarketActions";
import type { useMiningLoop } from "@/app/hooks/useMiningLoop";
import { halvingsAt, HALVING_BLOCKS, reward, UNIT } from "@/domain/protocol";
import { TERMINAL_HALVING } from "@/features/launch/halvings";
import { isSimulated, placeExample, SHOWCASE, showcase, supplyOf } from "./showcase";

const TIP = 3_000_000;

describe("the showcase", () => {
  const placed = showcase(TIP);

  it("is labelled as simulated, every one of it", () => {
    expect(placed.length).toBeGreaterThanOrEqual(5);
    for (const example of placed) {
      expect(example.source).toBe("simulated");
      expect(isSimulated(example)).toBe(true);
      expect(example.art.src).toMatch(/^\/tokens\/[a-z]+\.svg$/);
    }
  });

  it("spans the states a launch passes through", () => {
    const halvings = placed.map((p) => p.halvings);
    expect(placed.some((p) => p.phase === "announced")).toBe(true);
    expect(placed.some((p) => p.phase === "spent")).toBe(true);
    expect(halvings).toContain(0);
    expect(halvings.some((k) => k !== null && k >= 2 && k <= 3)).toBe(true);
    expect(halvings.some((k) => k !== null && k >= 8 && k < TERMINAL_HALVING)).toBe(true);
  });

  it("stays in the same state wherever the tip is", () => {
    for (const spec of SHOWCASE) {
      expect(placeExample(spec, 900_000).position).toEqual(placeExample(spec, TIP).position);
    }
  });

  it("mints only in halvings a launch has reached, at the standard reward", () => {
    for (const spec of SHOWCASE) {
      const example = placeExample(spec, TIP);
      const reached = halvingsAt(example.h0, TIP);
      for (const tally of spec.tallies) {
        expect(reached, `${spec.symbol} has not opened`).not.toBeNull();
        expect(tally.halving, `${spec.symbol} mints ahead of its schedule`).toBeLessThanOrEqual(reached!);
        expect(reward(tally.clz, example.h0, example.h0 + tally.halving * HALVING_BLOCKS), `${spec.symbol} tally mints nothing`).toBeGreaterThan(0n);
      }
      const expected = spec.tallies.reduce(
        (sum, t) => sum + BigInt(t.count) * ((UNIT * BigInt(t.clz * t.clz)) >> BigInt(t.halving)),
        0n,
      );
      expect(example.supply).toBe(expected);
      expect(example.supply).toBe(supplyOf(spec.tallies));
      expect(example.minerCells).toBeLessThanOrEqual(example.mints);
      expect(example.minerCells > 0).toBe(example.mints > 0);
    }
  });

  it("cannot be handed to anything that mints, lists or buys", () => {
    const [example] = placed;
    // Type-level: an example has no terms, token id or promoter, so it is not a Launch.
    // @ts-expect-error — the miner takes a real launch only.
    const miner: Parameters<typeof useMiningLoop>[0] = example;
    type Actions = ReturnType<typeof useMarketActions>;
    // @ts-expect-error — listing takes a real launch only.
    const list: Parameters<Actions["list"]>[0] = example;
    expect([miner, list].every(Boolean)).toBe(true);
    expect("terms" in example! || "tokenId" in example! || "promoter" in example!).toBe(false);
  });
});

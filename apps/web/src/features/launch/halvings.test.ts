import { describe, expect, it } from "vitest";

import { HALVING_BLOCKS, MAX_CLZ, terminalHalving } from "@/domain/protocol";
import { divisorLabel, halvingLabel, halvingPosition, ladder, periodShare, TERMINAL_HALVING, whereNow } from "./halvings";

const H0 = 800_000;

describe("halving position", () => {
  it("is 'announced' before opening, counting down to h0", () => {
    const p = halvingPosition(H0, H0 - 90);
    expect(p).toEqual({ state: "announced", blocksToOpen: 90 });
    expect(periodShare(p)).toBe(0);
    expect(halvingLabel(p)).toBe("Not open · 90 blocks to go");
    expect(whereNow(p)).toBe("Opens in 90 blocks (~15h) at the full rate.");
  });

  it("fills the bar through each halving period and restarts it at the next", () => {
    expect(halvingPosition(H0, H0)).toEqual({ state: "minting", halving: 0, elapsed: 0, remaining: HALVING_BLOCKS });
    const mid = halvingPosition(H0, H0 + 2 * HALVING_BLOCKS + 612);
    expect(mid).toEqual({ state: "minting", halving: 2, elapsed: 612, remaining: 396 });
    expect(periodShare(mid)).toBeCloseTo(612 / 1008);
    expect(halvingLabel(mid)).toBe("Halving 2 · 612/1,008 blocks · rate ÷4");
    expect(whereNow(mid)).toBe("Rate halves in 396 blocks (~2.8d).");
    expect(halvingPosition(H0, H0 + 3 * HALVING_BLOCKS)).toMatchObject({ halving: 3, elapsed: 0 });
  });

  it("turns terminal at the halving from which no hash mints anything", () => {
    expect(TERMINAL_HALVING).toBe(terminalHalving(MAX_CLZ));
    const last = halvingPosition(H0, H0 + TERMINAL_HALVING * HALVING_BLOCKS - 1);
    expect(last.state).toBe("minting");
    const spent = halvingPosition(H0, H0 + TERMINAL_HALVING * HALVING_BLOCKS);
    expect(spent).toEqual({ state: "terminal", halving: TERMINAL_HALVING });
    expect(periodShare(spent)).toBe(1);
    expect(whereNow(spent)).toBe(`Terminal: nothing mints after halving ${TERMINAL_HALVING - 1}.`);
  });

  it("names the divisor as a number while it is readable, as a power after", () => {
    expect(divisorLabel(0)).toBe("÷1");
    expect(divisorLabel(10)).toBe("÷1,024");
    expect(divisorLabel(20)).toBe("÷2^20");
  });

  it("marks the first four rungs behind, current and ahead", () => {
    expect(ladder(halvingPosition(H0, H0 - 1))).toEqual(["next", "next", "next", "next"]);
    expect(ladder(halvingPosition(H0, H0 + 2 * HALVING_BLOCKS))).toEqual(["past", "past", "now", "next"]);
    expect(ladder(halvingPosition(H0, H0 + 9 * HALVING_BLOCKS))).toEqual(["past", "past", "past", "past"]);
  });
});

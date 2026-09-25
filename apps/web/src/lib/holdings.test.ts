import { describe, expect, it } from "vitest";

import { landingMints, positionsOf, type LandingCandidate } from "./holdings";
import type { TokenCell } from "./rgbpp/operations";

const cell = (amount: bigint): TokenCell => ({ amount }) as TokenCell;

describe("positionsOf", () => {
  it("totals each token's cells and lists the largest balance first", () => {
    const positions = positionsOf({
      tokens: new Map([
        ["small", [cell(5n)]],
        ["large", [cell(40n), cell(60n)]],
        ["middle", [cell(50n)]],
      ]),
    });
    expect(positions.map((p) => [p.tokenId, p.total])).toEqual([
      ["large", 100n],
      ["middle", 50n],
      ["small", 5n],
    ]);
    expect(positions[0].cells).toHaveLength(2);
  });

  it("holds nothing for an empty wallet", () => {
    expect(positionsOf({ tokens: new Map() })).toEqual([]);
  });
});

describe("landingMints", () => {
  const op = (over: Partial<LandingCandidate>): LandingCandidate => ({ kind: "mint", tokenId: "t", stage: "sent", atoms: "10", ...over });

  it("sums the mints still sent or queued, by token", () => {
    const landing = landingMints([op({}), op({ stage: "queued", atoms: "5" }), op({ tokenId: "u", atoms: "7" })]);
    expect(landing).toEqual(
      new Map([
        ["t", 15n],
        ["u", 7n],
      ]),
    );
  });

  it("leaves out settled and failed mints, other kinds, and mints without an amount", () => {
    const landing = landingMints([
      op({ stage: "settled" }),
      op({ stage: "failed" }),
      op({ kind: "transfer" }),
      op({ atoms: undefined }),
    ]);
    expect(landing.size).toBe(0);
  });
});
